//! The browser lane against a mock `browser.control` broker: the sidecar must
//! speak the generic `{tool,args}` envelope with its bearer, retain real PNG and
//! DOM files, and classify refusals as "unavailable" so runs fall back honestly.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::routing::post;
use axum::{Json, Router};
use base64::Engine as _;
use ryu_checks::browser::{BrowserClient, BrowserError};
use serde_json::{json, Value};

const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR";

#[derive(Default)]
struct Seen {
    tools: Vec<String>,
    closed_tabs: Vec<String>,
    auth_ok: bool,
    fail_screenshot: bool,
}

async fn broker(
    State(seen): State<Arc<Mutex<Seen>>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> (StatusCode, Json<Value>) {
    let tool = body["tool"].as_str().unwrap_or_default().to_owned();
    let fail_screenshot = {
        let mut seen = seen.lock().unwrap();
        seen.auth_ok = headers
            .get("authorization")
            .and_then(|value| value.to_str().ok())
            == Some("Bearer secret")
            && headers.get("x-ryu-plugin-id").and_then(|v| v.to_str().ok()) == Some("@ryu/checks");
        seen.tools.push(tool.clone());
        if tool == "browser.close_tab" {
            seen.closed_tabs.push(
                body["args"]["tab_id"]
                    .as_str()
                    .unwrap_or_default()
                    .to_owned(),
            );
        }
        seen.fail_screenshot
    };
    let tab = json!({ "id": "tab-1", "url": "https://example.test/", "title": "Example" });
    let reply = match tool.as_str() {
        "browser.navigate" => json!({ "ok": true, "tab": tab }),
        "browser.snapshot" => json!({
            "elements": [{ "ref": "@e1", "role": "heading", "name": "Rendered Welcome", "depth": 0 }],
            "snapshot_id": "s1",
            "tab": tab,
            "truncated": false
        }),
        "browser.screenshot" if fail_screenshot => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "ok": false, "error": "capture failed" })),
            )
        }
        "browser.screenshot" => json!({
            "image": base64::engine::general_purpose::STANDARD.encode(PNG),
            "encoding": "base64",
            "mime": "image/png"
        }),
        "browser.close_tab" => json!({ "ok": true }),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "ok": false, "error": "unknown tool" })),
            )
        }
    };
    (StatusCode::OK, Json(reply))
}

async fn serve(router: Router) -> String {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    format!("http://{address}")
}

#[tokio::test]
async fn capture_retains_screenshot_and_dom_through_the_capability() {
    let seen = Arc::new(Mutex::new(Seen::default()));
    let base = serve(
        Router::new()
            .route("/api/host/capability/browser.control", post(broker))
            .with_state(seen.clone()),
    )
    .await;
    let client = BrowserClient::new(&base, "secret")
        .with_timing(Duration::from_secs(2), Duration::from_millis(10));

    let capture = client
        .capture("https://example.test/")
        .await
        .expect("capture");
    assert_eq!(capture.screenshot_png, PNG);
    assert_eq!(capture.title.as_deref(), Some("Example"));
    assert!(capture.rendered_text.contains("rendered welcome"));

    let seen = seen.lock().unwrap();
    assert!(seen.auth_ok, "bearer + plugin id are sent to the broker");
    assert_eq!(
        seen.tools.first().map(String::as_str),
        Some("browser.navigate")
    );
    assert_eq!(
        seen.tools.iter().rev().nth(1).map(String::as_str),
        Some("browser.screenshot")
    );
    assert_eq!(
        seen.closed_tabs,
        ["tab-1"],
        "evidence tab is closed after capture"
    );
    drop(seen);

    let dir = std::env::temp_dir().join(format!(
        "ryu-checks-evidence-{}",
        uuid::Uuid::new_v4().simple()
    ));
    let seal = test_seal();
    let written = ryu_checks::evidence::write(&dir, &seal, "evidence-abc", &capture).unwrap();
    assert_eq!(written, (true, true));
    // Retained evidence is sealed at rest.
    let png_on_disk =
        std::fs::read(ryu_checks::evidence::screenshot_path(&dir, "evidence-abc")).unwrap();
    assert!(png_on_disk.starts_with(b"RYU-SF01"));
    let (screenshot, dom) = ryu_checks::evidence::read(&dir, &seal, "evidence-abc").unwrap();
    assert_eq!(
        base64::engine::general_purpose::STANDARD
            .decode(screenshot.unwrap())
            .unwrap(),
        PNG
    );
    assert_eq!(dom.unwrap()["elements"][0]["name"], "Rendered Welcome");
    ryu_checks::evidence::remove(&dir, ["evidence-abc".to_owned()]);
    assert_eq!(
        ryu_checks::evidence::read(&dir, &seal, "evidence-abc").unwrap(),
        (None, None)
    );
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn evidence_tab_is_closed_when_capture_fails() {
    let seen = Arc::new(Mutex::new(Seen {
        fail_screenshot: true,
        ..Seen::default()
    }));
    let base = serve(
        Router::new()
            .route("/api/host/capability/browser.control", post(broker))
            .with_state(seen.clone()),
    )
    .await;
    let error = BrowserClient::new(&base, "secret")
        .with_timing(Duration::from_secs(2), Duration::from_millis(10))
        .capture("https://example.test/")
        .await
        .unwrap_err();
    assert!(matches!(error, BrowserError::Failed(_)), "{error}");
    assert_eq!(seen.lock().unwrap().closed_tabs, ["tab-1"]);
}

#[tokio::test]
async fn ungranted_capability_is_reported_unavailable() {
    let base = serve(Router::new().route(
        "/api/host/capability/browser.control",
        post(|| async {
            (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "capability grant not granted" })),
            )
        }),
    ))
    .await;
    let error = BrowserClient::new(&base, "secret")
        .capture("https://example.test/")
        .await
        .unwrap_err();
    assert!(matches!(error, BrowserError::Unavailable(_)), "{error}");
}

/// Evidence sealing under a fixed test key.
fn test_seal() -> ryu_checks::seal_keys::StoreSeal {
    let subkey = base64::engine::general_purpose::STANDARD.encode([7u8; 32]);
    let cipher = ryu_crypto::PluginCipher::from_subkey_b64("@ryu/checks", &subkey).unwrap();
    ryu_checks::seal_keys::PluginKeys::sealing(cipher, ryu_checks::seal_keys::KeySource::Delivered)
        .store_state(ryu_checks::evidence::STORE, None, false)
}

fn project(url: &str) -> ryu_checks::model::Project {
    serde_json::from_value(json!({
        "id": "project-1",
        "name": "Demo",
        "description": "",
        "type": "Mixed",
        "url": url,
        "tests": 2,
        "passed": 0,
        "attention": 0,
        "coverage": 0,
        "status": "idle",
        "lastRun": "Never",
        "nextRun": "Manual",
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-01T00:00:00Z"
    }))
    .expect("project")
}

fn case(id: &str, test_type: &str, request_path: Option<&str>) -> ryu_checks::model::TestCase {
    serde_json::from_value(json!({
        "id": id,
        "projectId": "project-1",
        "name": id,
        "description": "",
        "priority": "High",
        "type": test_type,
        "status": "idle",
        "feature": "",
        "steps": [],
        "source": "",
        "requestPath": request_path,
        "updated": "never"
    }))
    .expect("test case")
}

fn evidence_files(dir: &std::path::Path) -> Vec<String> {
    std::fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .map(|entry| entry.file_name().to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default()
}

#[tokio::test]
async fn aborted_run_removes_evidence_written_for_earlier_cases() {
    let seen = Arc::new(Mutex::new(Seen::default()));
    let broker_base = serve(
        Router::new()
            .route("/api/host/capability/browser.control", post(broker))
            .with_state(seen.clone()),
    )
    .await;
    // The first (UI) case passes and captures evidence; the second case's body
    // exceeds the runner's response limit, which aborts the whole run.
    let target = serve(
        Router::new()
            .route(
                "/",
                axum::routing::get(|| async { "<title>Demo</title>Welcome" }),
            )
            .route(
                "/huge",
                axum::routing::get(|| async { "x".repeat(3 * 1024 * 1024) }),
            ),
    )
    .await;
    let dir = std::env::temp_dir().join(format!(
        "ryu-checks-evidence-abort-{}",
        uuid::Uuid::new_v4().simple()
    ));
    let env = ryu_checks::evidence::EvidenceEnv {
        browser: Some(
            BrowserClient::new(&broker_base, "secret")
                .with_timing(Duration::from_secs(2), Duration::from_millis(10)),
        ),
        dir: Some(dir.clone()),
        seal: Some(test_seal()),
    };
    let tests = [
        case("ui-home", "UI", None),
        case("api-huge", "API", Some("/huge")),
    ];

    let error = ryu_checks::runner::run_project(&project(&target), &tests, "manual", &env)
        .await
        .expect_err("the oversized second case aborts the run");
    assert!(error.to_string().contains("too large"), "{error}");
    assert!(
        seen.lock()
            .unwrap()
            .tools
            .iter()
            .any(|tool| tool == "browser.screenshot"),
        "the first case captured browser evidence before the abort"
    );
    assert!(
        evidence_files(&dir).is_empty(),
        "orphaned evidence files remain: {:?}",
        evidence_files(&dir)
    );

    // A run that completes keeps its files for the store to own.
    let run = ryu_checks::runner::run_project(&project(&target), &tests[..1], "manual", &env)
        .await
        .expect("run");
    assert!(run.evidence[0].screenshot_available);
    assert_eq!(evidence_files(&dir).len(), 2);
    let _ = std::fs::remove_dir_all(dir);
}
