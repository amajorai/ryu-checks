use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Arc,
};

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use chrono::{Duration, Utc};
use ryu_checks::{
    api::routes_with_authorization, authorization::AuthorizationClient, model::Schedule, service,
    Ctx, Store, TenantContext,
};
use serde_json::{json, Value};

#[derive(Clone)]
struct Authority {
    allowed: Arc<AtomicBool>,
}

async fn authorize(
    State(state): State<Authority>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> (StatusCode, Json<Value>) {
    assert_eq!(
        headers.get("x-ryu-plugin-id").expect("plugin"),
        "@ryu/checks"
    );
    assert_eq!(
        headers.get("authorization").expect("bearer"),
        "Bearer app-hop"
    );
    assert_eq!(body["args"]["permission"], "checks.run");
    assert_eq!(body["args"]["resource"], "@ryu/checks");
    if !state.allowed.load(Ordering::SeqCst) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error":"execution permission denied"})),
        );
    }
    let result = match body["method"].as_str() {
        Some("authorization.issue") if body["args"]["proof"] == "core-principal" => {
            json!({"proof":"execution-proof","userId":"alice","orgId":"org"})
        }
        Some("authorization.check") if body["args"]["proof"] == "execution-proof" => {
            json!({"allowed":true,"userId":"alice","orgId":"org"})
        }
        _ => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error":"invalid proof"})),
            )
        }
    };
    (StatusCode::OK, Json(json!({"result":result})))
}

async fn serve(app: Router) -> (String, tokio::task::JoinHandle<()>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind");
    let origin = format!("http://{}", listener.local_addr().expect("address"));
    let handle = tokio::spawn(async move {
        axum::serve(listener, app).await.expect("serve");
    });
    (origin, handle)
}

#[tokio::test]
async fn http_activation_requires_run_and_ticks_recheck_revocation() {
    let allowed = Arc::new(AtomicBool::new(false));
    let (host, host_task) = serve(Router::new().route("/rpc", post(authorize)).with_state(
        Authority {
            allowed: allowed.clone(),
        },
    ))
    .await;
    let hits = Arc::new(AtomicUsize::new(0));
    let target_hits = hits.clone();
    let (target, target_task) = serve(Router::new().route(
        "/",
        get(move || {
            let target_hits = target_hits.clone();
            async move {
                target_hits.fetch_add(1, Ordering::SeqCst);
                "<html><title>Checks fixture</title><body>healthy</body></html>"
            }
        }),
    ))
    .await;
    let root = std::env::temp_dir().join(format!("checks-schedule-auth-{}", uuid::Uuid::new_v4()));
    let store = Store::open(root.join("checks.json")).expect("store");
    let tenant = TenantContext {
        owner_user_id: Some("alice".to_owned()),
        org_id: Some("org".to_owned()),
        node_id: store.node_id().to_owned(),
    };
    let (project, _) = store
        .create_project_for(
            &tenant,
            "Gate".into(),
            "".into(),
            "API".into(),
            target,
            vec!["healthy".into()],
            None,
            Vec::new(),
        )
        .expect("project");
    let list = store.create_list_for(&tenant, "List".into()).expect("list");
    store
        .update_list_for(&tenant, &list.id, vec![project.id], None)
        .expect("update list");
    let client = AuthorizationClient::new(format!("{host}/rpc"), "app-hop".to_owned());
    let (checks, checks_task) = serve(routes_with_authorization(
        Arc::new(Ctx {
            store: store.clone(),
        }),
        Some(client.clone()),
    ))
    .await;
    // This is the production HTTP surface over a loopback fixture. Keep host
    // proxy variables from replacing that caller with an external proxy.
    let http = reqwest::Client::builder()
        .no_proxy()
        .build()
        .expect("loopback client");
    let create = || {
        http.post(format!("{checks}/schedules"))
            .header("x-ryu-caller-user-id", "alice")
            .header("x-ryu-caller-org-id", "org")
            .header("x-ryu-caller-principal-proof", "core-principal")
            .json(&json!({"name":"Recurring gate","listId":list.id,"frequency":"Every 1 minute"}))
    };
    assert_eq!(
        create().send().await.expect("denied create").status(),
        StatusCode::FORBIDDEN
    );
    assert!(store.snapshot().schedules.is_empty());
    assert_eq!(hits.load(Ordering::SeqCst), 0);
    allowed.store(true, Ordering::SeqCst);
    let response = create().send().await.expect("authorized create");
    let response_status = response.status();
    let response_body = response.text().await.expect("schedule response body");
    assert_eq!(response_status, StatusCode::OK, "{response_body}");
    let schedule: Schedule = serde_json::from_str(&response_body).expect("schedule");
    let due = store.due_schedules(Utc::now() + Duration::minutes(2));
    assert_eq!(due.len(), 1);
    let runs = service::run_scheduled_list(&store, &due[0], Some(&client))
        .await
        .expect("authorized tick");
    assert!(!runs.is_empty());
    assert!(hits.load(Ordering::SeqCst) > 0);
    assert!(store
        .snapshot_for(&tenant)
        .runs
        .iter()
        .all(|run| run.tenant.matches(&tenant)));
    let before_revoke = hits.load(Ordering::SeqCst);
    allowed.store(false, Ordering::SeqCst);
    let reopened = Store::open(root.join("checks.json")).expect("reopen retained schedules");
    let persisted = reopened
        .snapshot_for(&tenant)
        .schedules
        .into_iter()
        .find(|item| item.id == schedule.id)
        .expect("retained schedule");
    assert_eq!(
        persisted.execution_authorization,
        schedule.execution_authorization
    );
    assert!(
        service::run_scheduled_list(&reopened, &persisted, Some(&client))
            .await
            .is_err()
    );
    assert_eq!(hits.load(Ordering::SeqCst), before_revoke);
    drop(reopened);
    assert!(
        service::run_scheduled_list(&store, &schedule, Some(&client))
            .await
            .is_err()
    );
    assert_eq!(hits.load(Ordering::SeqCst), before_revoke);
    let enable = http
        .patch(format!("{checks}/schedules/{}", schedule.id))
        .header("x-ryu-caller-user-id", "alice")
        .header("x-ryu-caller-org-id", "org")
        .header("x-ryu-caller-principal-proof", "core-principal")
        .json(&json!({"active":true}))
        .send()
        .await
        .expect("denied enable");
    assert_eq!(enable.status(), StatusCode::FORBIDDEN);
    let mut legacy = schedule.clone();
    legacy.execution_authorization = None;
    assert!(service::run_scheduled_list(&store, &legacy, Some(&client))
        .await
        .is_err());
    let mut tampered = schedule.clone();
    tampered.execution_authorization = Some("forged-proof".to_owned());
    allowed.store(true, Ordering::SeqCst);
    assert!(
        service::run_scheduled_list(&store, &tampered, Some(&client))
            .await
            .is_err()
    );
    assert_eq!(hits.load(Ordering::SeqCst), before_revoke);
    drop(store);
    checks_task.abort();
    host_task.abort();
    target_task.abort();
    std::fs::remove_dir_all(root).expect("remove fixture");
}

#[tokio::test]
async fn local_owner_schedule_remains_scoped_and_inactive_schedule_never_runs() {
    let root = std::env::temp_dir().join(format!("checks-local-schedule-{}", uuid::Uuid::new_v4()));
    let store = Store::open(root.join("checks.json")).expect("store");
    let list = store.create_list("Empty gate".into()).expect("list");
    let schedule = store
        .create_schedule("Local".into(), list.id, "Every 1 minute".into())
        .expect("schedule");
    assert!(service::run_scheduled_list(&store, &schedule, None)
        .await
        .expect("local tick")
        .is_empty());
    let paused = store
        .set_schedule_active(&schedule.id, false)
        .expect("pause");
    assert!(service::run_scheduled_list(&store, &paused, None)
        .await
        .is_err());
    drop(store);
    std::fs::remove_dir_all(root).expect("remove fixture");
}
