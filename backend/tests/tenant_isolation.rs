use std::path::PathBuf;
use std::sync::Arc;

use axum::body::{to_bytes, Body};
use axum::http::{HeaderMap, HeaderValue, Request, StatusCode};
use chrono::Utc;
use ryu_checks::model::{AgentArtifact, AgentRunRecord, FailureBundle, RunRecord, TenantScope};
use ryu_checks::{routes, tenant_from_headers, Ctx, Store, TenantContext};
use serde_json::{json, Value};
use tower::ServiceExt;
use uuid::Uuid;

fn fixture_root() -> PathBuf {
    std::env::temp_dir().join(format!(
        "ryu-checks-tenant-test-{}",
        Uuid::new_v4().simple()
    ))
}

fn tenant(user: &str, org: &str, store: &Store) -> TenantContext {
    TenantContext {
        owner_user_id: Some(user.to_owned()),
        org_id: Some(org.to_owned()),
        node_id: store.node_id().to_owned(),
    }
}

fn run_record(project_id: &str) -> RunRecord {
    RunRecord {
        id: "run-alice".to_owned(),
        tenant: TenantScope::default(),
        project_id: project_id.to_owned(),
        status: "completed".to_owned(),
        verdict: "attention".to_owned(),
        trigger: "test".to_owned(),
        scope: "project".to_owned(),
        target_test_id: None,
        started_at: Utc::now(),
        finished_at: Utc::now(),
        duration_ms: 10,
        passed: 0,
        failed: 1,
        skipped: 0,
        coverage: 0,
        summary: "one failure".to_owned(),
        evidence_level: "live-http".to_owned(),
        evidence: Vec::new(),
        failures: vec![FailureBundle {
            id: "failure-alice".to_owned(),
            test_id: format!("{project_id}-test-1"),
            title: "Failure".to_owned(),
            failed_step: "Verify".to_owned(),
            root_cause: "test".to_owned(),
            suggested_fix: "fix".to_owned(),
            source: "test".to_owned(),
            evidence_id: "evidence-alice".to_owned(),
            screenshot_available: false,
            dom_snapshot: None,
            status: "open".to_owned(),
            healed_at: None,
            healing_note: None,
        }],
        exploration_id: None,
    }
}

fn agent_run(project_id: &str) -> AgentRunRecord {
    AgentRunRecord {
        id: "agent-run-alice".to_owned(),
        tenant: TenantScope::default(),
        project_id: project_id.to_owned(),
        agent_id: "agent".to_owned(),
        status: "completed".to_owned(),
        verdict: "unverified".to_owned(),
        evidence_level: "agent-transcript".to_owned(),
        transcript: "transcript".to_owned(),
        artifacts: vec![AgentArtifact {
            kind: "agent-transcript".to_owned(),
            label: "Transcript".to_owned(),
            available: true,
            reference: None,
        }],
        started_at: Utc::now(),
        finished_at: Utc::now(),
    }
}

async fn request(
    app: &axum::Router,
    method: &str,
    path: &str,
    user: Option<&str>,
    org: Option<&str>,
    payload: Option<Value>,
) -> (StatusCode, Value) {
    let mut builder = Request::builder().method(method).uri(path);
    if let Some(user) = user {
        builder = builder.header("x-ryu-caller-user-id", user);
    }
    if let Some(org) = org {
        builder = builder.header("x-ryu-caller-org-id", org);
    }
    let body = payload
        .map(|value| Body::from(value.to_string()))
        .unwrap_or_else(Body::empty);
    let response = app
        .clone()
        .oneshot(
            builder
                .header("content-type", "application/json")
                .body(body)
                .expect("build request"),
        )
        .await
        .expect("receive response");
    let status = response.status();
    let body = to_bytes(response.into_body(), 1024 * 1024)
        .await
        .expect("read response body");
    (
        status,
        serde_json::from_slice(&body).expect("response should be JSON"),
    )
}

#[test]
fn tenant_context_uses_server_node_and_denies_unresolved_managed_callers() {
    let headers = HeaderMap::new();
    assert_eq!(
        tenant_from_headers(&headers, "server-node", true),
        Err(StatusCode::FORBIDDEN)
    );

    let mut headers = HeaderMap::new();
    headers.insert("x-ryu-caller-user-id", HeaderValue::from_static("alice"));
    headers.insert("x-ryu-caller-org-id", HeaderValue::from_static("org-1"));
    headers.insert("x-ryu-node-id", HeaderValue::from_static("attacker-node"));
    let tenant = tenant_from_headers(&headers, "server-node", true).expect("resolved caller");
    assert_eq!(tenant.owner_user_id.as_deref(), Some("alice"));
    assert_eq!(tenant.org_id.as_deref(), Some("org-1"));
    assert_eq!(tenant.node_id, "server-node");
}

#[tokio::test]
async fn checks_routes_scope_reads_and_mutations_to_exact_owner_org_node() {
    let root = fixture_root();
    let store = Store::open(root.join("checks.json")).expect("open store");
    let alice = tenant("alice", "org-shared", &store);
    let bob = tenant("bob", "org-shared", &store);
    let alice_other_org = tenant("alice", "org-other", &store);

    let (alice_project, alice_tests) = store
        .create_project_for(
            &alice,
            "Alice project".to_owned(),
            "Private project".to_owned(),
            "API".to_owned(),
            "https://alice.example.test".to_owned(),
            vec!["Alice case".to_owned()],
            None,
            Vec::new(),
        )
        .expect("create Alice project");
    let (bob_project, _) = store
        .create_project_for(
            &bob,
            "Bob project".to_owned(),
            "Private project".to_owned(),
            "API".to_owned(),
            "https://bob.example.test".to_owned(),
            vec!["Bob case".to_owned()],
            None,
            Vec::new(),
        )
        .expect("create Bob project");
    let alice_list = store
        .create_list_for(&alice, "Alice list".to_owned())
        .expect("create Alice list");
    let alice_schedule = store
        .create_schedule_for(
            &alice,
            "Alice schedule".to_owned(),
            alice_list.id.clone(),
            "1 day".to_owned(),
        )
        .expect("create Alice schedule");
    store
        .save_run_for(&alice, run_record(&alice_project.id))
        .expect("save Alice run");
    store
        .save_agent_run_for(&alice, agent_run(&alice_project.id))
        .expect("save Alice agent run");

    let app = routes(Arc::new(Ctx {
        store: store.clone(),
    }));

    let (status, body) = request(
        &app,
        "GET",
        "/bootstrap",
        Some("alice"),
        Some("org-shared"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["projects"].as_array().expect("projects").len(), 1);
    assert_eq!(body["projects"][0]["id"], alice_project.id);
    assert_eq!(body["runs"].as_array().expect("runs").len(), 1);
    assert_eq!(body["agentRuns"].as_array().expect("agent runs").len(), 1);

    let (status, body) = request(
        &app,
        "GET",
        "/projects",
        Some("bob"),
        Some("org-shared"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["projects"].as_array().expect("projects").len(), 1);
    assert_eq!(body["projects"][0]["id"], bob_project.id);

    for (user, org, expected) in [
        (Some("alice"), Some("org-shared"), StatusCode::OK),
        (Some("bob"), Some("org-shared"), StatusCode::NOT_FOUND),
        (
            alice_other_org.owner_user_id.as_deref(),
            alice_other_org.org_id.as_deref(),
            StatusCode::NOT_FOUND,
        ),
    ] {
        let (status, _) = request(
            &app,
            "GET",
            &format!("/projects/{}", alice_project.id),
            user,
            org,
            None,
        )
        .await;
        assert_eq!(status, expected);
    }

    for path in [
        format!("/projects/{}/agent-runs", alice_project.id),
        format!("/projects/{}/runs", alice_project.id),
        "/runs/run-alice".to_owned(),
    ] {
        let (status, _) = request(&app, "GET", &path, Some("bob"), Some("org-shared"), None).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{path}");
        let (status, _) =
            request(&app, "GET", &path, Some("alice"), Some("org-shared"), None).await;
        assert_eq!(status, StatusCode::OK, "{path}");
    }

    let (status, body) = request(
        &app,
        "GET",
        "/lists",
        Some("alice"),
        Some("org-shared"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["lists"].as_array().expect("lists").len(), 1);
    let (status, body) =
        request(&app, "GET", "/lists", Some("bob"), Some("org-shared"), None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["lists"].as_array().expect("lists").is_empty());

    let (status, body) = request(
        &app,
        "GET",
        "/schedules",
        Some("alice"),
        Some("org-shared"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["schedules"].as_array().expect("schedules").len(), 1);
    let (status, body) = request(
        &app,
        "GET",
        "/analytics",
        Some("bob"),
        Some("org-shared"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["projects"], 1);

    let test_id = &alice_tests[0].id;
    let (status, _) = request(
        &app,
        "PATCH",
        &format!("/tests/{test_id}"),
        Some("bob"),
        Some("org-shared"),
        Some(json!({"name":"cross-tenant"})),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, body) = request(
        &app,
        "PATCH",
        &format!("/tests/{test_id}"),
        Some("alice"),
        Some("org-shared"),
        Some(json!({"name":"Alice updated"})),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["name"], "Alice updated");

    let (status, _) = request(
        &app,
        "POST",
        "/runs/run-alice/failures/failure-alice/heal",
        Some("bob"),
        Some("org-shared"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, body) = request(
        &app,
        "POST",
        "/runs/run-alice/failures/failure-alice/heal",
        Some("alice"),
        Some("org-shared"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["id"], "run-alice");

    let (status, _) = request(
        &app,
        "PATCH",
        &format!("/lists/{}", alice_list.id),
        Some("bob"),
        Some("org-shared"),
        Some(json!({"projectIds":[],"testIds":[]})),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = request(
        &app,
        "PATCH",
        &format!("/lists/{}", alice_list.id),
        Some("alice"),
        Some("org-shared"),
        Some(json!({"projectIds":[],"testIds":[]})),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, _) = request(
        &app,
        "PATCH",
        &format!("/schedules/{}", alice_schedule.id),
        Some("bob"),
        Some("org-shared"),
        Some(json!({"active":false})),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, body) = request(
        &app,
        "PATCH",
        &format!("/schedules/{}", alice_schedule.id),
        Some("alice"),
        Some("org-shared"),
        Some(json!({"active":false})),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["active"], false);

    let (status, _) = request(
        &app,
        "DELETE",
        &format!("/schedules/{}", alice_schedule.id),
        Some("bob"),
        Some("org-shared"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = request(
        &app,
        "DELETE",
        &format!("/projects/{}", alice_project.id),
        Some("bob"),
        Some("org-shared"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = request(
        &app,
        "DELETE",
        &format!("/schedules/{}", alice_schedule.id),
        Some("alice"),
        Some("org-shared"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let (status, _) = request(
        &app,
        "DELETE",
        &format!("/projects/{}", alice_project.id),
        Some("alice"),
        Some("org-shared"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let wrong_node = TenantContext {
        owner_user_id: Some("bob".to_owned()),
        org_id: Some("org-shared".to_owned()),
        node_id: "other-node".to_owned(),
    };
    assert!(store
        .get_project_for(&wrong_node, &bob_project.id)
        .is_none());
    assert!(store
        .delete_project_for(&wrong_node, &bob_project.id)
        .is_err());

    let _ = std::fs::remove_dir_all(root);
}
