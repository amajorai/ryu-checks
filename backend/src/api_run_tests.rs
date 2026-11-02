//! The execution routes (run a test, a project, a list or a schedule, and
//! explore a project) over the real router, against a loopback target.

use std::path::PathBuf;
use std::sync::Arc;

use crate::{routes, Ctx, Store, TenantContext};
use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use axum::routing::get;
use axum::Router;
use serde_json::{json, Value};
use tower::ServiceExt;
use uuid::Uuid;

const ORG: &str = "org-shared";

fn fixture_root() -> PathBuf {
    std::env::temp_dir().join(format!("ryu-checks-run-test-{}", Uuid::new_v4().simple()))
}

fn tenant(user: &str, store: &Store) -> TenantContext {
    TenantContext {
        owner_user_id: Some(user.to_owned()),
        org_id: Some(ORG.to_owned()),
        node_id: store.node_id().to_owned(),
    }
}

/// A loopback target: `/` answers 200, `/down` answers 503.
async fn target() -> String {
    let app = Router::new()
        .route("/", get(|| async { "<title>Up</title>ok" }))
        .route(
            "/down",
            get(|| async { (StatusCode::SERVICE_UNAVAILABLE, "down") }),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    format!("http://{address}")
}

async fn call(
    app: &Router,
    method: &str,
    path: &str,
    user: &str,
    body: Value,
) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(path)
                .header("x-ryu-caller-user-id", user)
                .header("x-ryu-caller-org-id", ORG)
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = to_bytes(response.into_body(), 4 * 1024 * 1024)
        .await
        .unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

struct Fixture {
    root: PathBuf,
    store: Store,
    app: Router,
    up_project: String,
    up_test: String,
    down_project: String,
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

async fn fixture() -> Fixture {
    let base = target().await;
    let root = fixture_root();
    let store = Store::open(root.join("checks.json")).unwrap();
    let alice = tenant("alice", &store);
    let (up, up_tests) = store
        .create_project_for(
            &alice,
            "Up".to_owned(),
            String::new(),
            "api".to_owned(),
            format!("{base}/"),
            vec!["Health".to_owned()],
            None,
            Vec::new(),
        )
        .unwrap();
    let (down, _) = store
        .create_project_for(
            &alice,
            "Down".to_owned(),
            String::new(),
            "api".to_owned(),
            format!("{base}/down"),
            vec!["Health".to_owned()],
            None,
            Vec::new(),
        )
        .unwrap();
    let app = routes(Arc::new(Ctx {
        store: store.clone(),
    }));
    Fixture {
        root,
        store,
        app,
        up_project: up.id,
        up_test: up_tests[0].id.clone(),
        down_project: down.id,
    }
}

fn runs_of(store: &Store, user: &str) -> Vec<crate::model::RunRecord> {
    store.snapshot_for(&tenant(user, store)).runs
}

#[tokio::test]
async fn running_one_test_records_a_test_scoped_run_for_its_owner_only() {
    let fx = fixture().await;
    let path = format!("/tests/{}/run", fx.up_test);

    let (status, run) = call(&fx.app, "POST", &path, "alice", json!({})).await;
    assert_eq!(status, StatusCode::OK, "{run}");
    assert_eq!(run["scope"], "test");
    assert_eq!(run["targetTestId"], fx.up_test.as_str());
    assert_eq!(run["projectId"], fx.up_project.as_str());
    assert_eq!(run["verdict"], "passed");
    assert_eq!(run["passed"], 1);
    assert_eq!(run["evidence"][0]["statusCode"], 200);
    let stored = runs_of(&fx.store, "alice");
    assert_eq!(stored.len(), 1);
    assert_eq!(stored[0].id, run["id"].as_str().unwrap());

    // Another member of the org cannot execute Alice's test.
    let (status, body) = call(&fx.app, "POST", &path, "bob", json!({})).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
    assert_eq!(body["error"]["code"], "not_found");
    let (status, _) = call(
        &fx.app,
        "POST",
        "/tests/no-such-test/run",
        "alice",
        json!({}),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(runs_of(&fx.store, "alice").len(), 1, "no run recorded");
    assert!(runs_of(&fx.store, "bob").is_empty());
}

#[tokio::test]
async fn running_a_project_explores_it_and_reports_a_failing_target() {
    let fx = fixture().await;

    let (status, run) = call(
        &fx.app,
        "POST",
        &format!("/projects/{}/runs", fx.up_project),
        "alice",
        json!({ "trigger": "manual" }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{run}");
    assert_eq!(run["scope"], "project");
    assert_eq!(run["trigger"], "manual");
    assert_eq!(run["verdict"], "passed");
    assert!(
        run["explorationId"].is_string(),
        "the run is linked to its exploration"
    );

    let (status, failing) = call(
        &fx.app,
        "POST",
        &format!("/projects/{}/runs", fx.down_project),
        "alice",
        json!({}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(failing["verdict"], "attention");
    assert_eq!(failing["failed"], 1);
    assert_eq!(failing["failures"][0]["rootCause"], "http_expected_200");

    let (_, listed) = call(
        &fx.app,
        "GET",
        &format!("/projects/{}/runs", fx.up_project),
        "alice",
        Value::Null,
    )
    .await;
    assert_eq!(listed["runs"].as_array().unwrap().len(), 1);
    assert_eq!(listed["runs"][0]["id"], run["id"]);

    for user in ["bob", "alice"] {
        let project = if user == "bob" {
            &fx.up_project
        } else {
            "project-missing"
        };
        let (status, _) = call(
            &fx.app,
            "POST",
            &format!("/projects/{project}/runs"),
            user,
            json!({}),
        )
        .await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{user}");
    }
    assert_eq!(runs_of(&fx.store, "alice").len(), 2);
    assert!(runs_of(&fx.store, "bob").is_empty());
}

#[tokio::test]
async fn exploring_a_project_saves_the_observed_page_for_its_owner() {
    let fx = fixture().await;
    let path = format!("/projects/{}/explore", fx.up_project);

    let (status, exploration) = call(&fx.app, "POST", &path, "alice", Value::Null).await;
    assert_eq!(status, StatusCode::OK, "{exploration}");
    assert_eq!(exploration["status"], "completed");
    assert_eq!(exploration["projectId"], fx.up_project.as_str());
    assert_eq!(exploration["pages"][0]["statusCode"], 200);
    assert_eq!(exploration["pages"][0]["title"], "Up");
    let saved = fx
        .store
        .snapshot_for(&tenant("alice", &fx.store))
        .explorations;
    assert_eq!(saved.len(), 1);
    assert_eq!(saved[0].id, exploration["id"].as_str().unwrap());

    let (status, _) = call(&fx.app, "POST", &path, "bob", Value::Null).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert!(fx
        .store
        .snapshot_for(&tenant("bob", &fx.store))
        .explorations
        .is_empty());
}

#[tokio::test]
async fn lists_and_schedules_run_their_projects_and_stay_with_their_owner() {
    let fx = fixture().await;
    let alice = tenant("alice", &fx.store);
    let list = fx
        .store
        .create_list_for(&alice, "Smoke".to_owned())
        .unwrap();
    fx.store
        .update_list_for(
            &alice,
            &list.id,
            vec![fx.up_project.clone()],
            Some(Vec::new()),
        )
        .unwrap();
    let schedule = fx
        .store
        .create_schedule_for(
            &alice,
            "Nightly".to_owned(),
            list.id.clone(),
            "1 day".to_owned(),
        )
        .unwrap();

    let (status, body) = call(
        &fx.app,
        "POST",
        &format!("/lists/{}/runs", list.id),
        "alice",
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let runs = body["runs"].as_array().unwrap();
    assert_eq!(runs.len(), 1, "only the listed project runs");
    assert_eq!(runs[0]["projectId"], fx.up_project.as_str());
    assert_eq!(runs[0]["trigger"], "list");

    let (status, body) = call(
        &fx.app,
        "POST",
        &format!("/schedules/{}/run", schedule.id),
        "alice",
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["runs"][0]["trigger"], "schedule-manual");
    assert_eq!(body["schedule"]["lastResult"], "passed");
    assert!(body["schedule"]["lastRunAt"].is_string());
    let stored = fx.store.snapshot_for(&alice).schedules;
    assert_eq!(stored[0].last_result, "passed");
    assert_eq!(runs_of(&fx.store, "alice").len(), 2);

    for path in [
        format!("/lists/{}/runs", list.id),
        format!("/schedules/{}/run", schedule.id),
        "/lists/list-missing/runs".to_owned(),
    ] {
        let (status, body) = call(&fx.app, "POST", &path, "bob", Value::Null).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{path}: {body}");
    }
    assert_eq!(runs_of(&fx.store, "alice").len(), 2, "bob ran nothing");
}
