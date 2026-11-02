//! The `mcp` server and CLI modes Core spawns hold no sealing key. Once the
//! sidecar has sealed `checks.json` they still list, read and run projects,
//! through the sidecar's loopback handoff.

use std::sync::Arc;

use axum::{
    extract::Request,
    http::StatusCode,
    middleware::{from_fn, Next},
    response::IntoResponse,
    routing::get,
    Router,
};
use base64::Engine as _;
use ryu_checks::{
    seal_keys::{KeySource, PluginKeys},
    sidecar_link, Ctx, Store, TenantContext,
};
use serde_json::Value;

fn sealing_keys() -> PluginKeys {
    let subkey = base64::engine::general_purpose::STANDARD.encode([9u8; 32]);
    let cipher = ryu_crypto::PluginCipher::from_subkey_b64("@ryu/checks", &subkey).unwrap();
    PluginKeys::sealing(cipher, KeySource::Delivered)
}

async fn serve(app: Router) -> u16 {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind");
    let port = listener.local_addr().expect("address").port();
    tokio::spawn(async move {
        axum::serve(listener, app).await.expect("serve");
    });
    port
}

/// The sidecar's router as `main` assembles it: `/health` open, the API
/// behind the Core ext token or the handoff token.
fn sidecar_app(
    store: Store,
    ext_token: &'static str,
    handoff: Arc<std::sync::OnceLock<String>>,
) -> Router {
    let protected = Router::new()
        .nest("/api/checks", ryu_checks::routes(Arc::new(Ctx { store })))
        .layer(from_fn(move |request: Request, next: Next| {
            let handoff = handoff.clone();
            async move {
                match sidecar_link::admit(
                    request,
                    Some(ext_token),
                    handoff.get().map(String::as_str),
                ) {
                    Some(request) => next.run(request).await,
                    None => (StatusCode::UNAUTHORIZED, "unauthorized").into_response(),
                }
            }
        }));
    Router::new()
        .route("/health", get(|| async { "ok" }))
        .merge(protected)
}

#[tokio::test]
async fn a_keyless_client_lists_and_runs_projects_of_a_sidecar_sealed_store() {
    let (target_port, root) = (
        serve(Router::new().route(
            "/",
            get(|| async { "<html><title>Fixture</title><body>healthy</body></html>" }),
        ))
        .await,
        std::env::temp_dir().join(format!("checks-handoff-{}", uuid::Uuid::new_v4())),
    );
    let state = root.join("checks.json");

    // The sidecar: holds the delivered key and seals the store.
    let sidecar = Store::open_with_keys(&state, &sealing_keys()).expect("sidecar store");
    let tenant = TenantContext::local(sidecar.node_id());
    let (project, _) = sidecar
        .create_project_for(
            &tenant,
            "Checkout".into(),
            "".into(),
            "API".into(),
            format!("http://127.0.0.1:{target_port}"),
            vec!["healthy".into()],
            None,
            Vec::new(),
        )
        .expect("project");
    let raw = std::fs::read(&state).unwrap();
    assert!(raw.starts_with(b"encb:"), "the sidecar sealed checks.json");
    assert!(!String::from_utf8_lossy(&raw).contains("Checkout"));

    let handoff_cell = Arc::new(std::sync::OnceLock::new());
    let port = serve(sidecar_app(
        sidecar.clone(),
        "core-ext-token",
        handoff_cell.clone(),
    ))
    .await;
    let handoff = sidecar_link::publish(&root, port).expect("publish");
    handoff_cell.set(handoff.token.clone()).unwrap();

    // The `mcp` process Core spawns: no delivered key, no master key, no
    // standalone root file, so it resolves to compat and cannot open the store.
    let keys = if std::env::var("RYU_MASTER_KEY").is_ok() {
        PluginKeys::compat()
    } else {
        PluginKeys::resolve_existing("@ryu/checks", &root).expect("resolve")
    };
    assert!(!keys.can_seal());
    let direct = Store::open_with_keys(&state, &keys).expect("keyless open");
    assert_eq!(direct.seal_health()["state"], "unhealthy");
    assert!(direct.snapshot().projects.is_empty());

    // Through the handoff it still lists, reads analytics and runs.
    let client = sidecar_link::SidecarClient::connect(&root)
        .await
        .expect("sidecar answers");
    let projects = client.projects().await.expect("projects");
    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0]["id"], project.id.as_str());
    assert_eq!(projects[0]["name"], "Checkout");
    let analytics = client.analytics().await.expect("analytics");
    assert!(analytics.is_object());
    let run = client
        .run_project(&project.id, "mcp")
        .await
        .expect("run through the sidecar");
    assert_eq!(run["projectId"], project.id.as_str());
    assert_eq!(run["trigger"], "mcp");
    assert_eq!(
        sidecar.snapshot().runs.len(),
        1,
        "the run was recorded in the sealed store"
    );

    // A forged caller identity cannot reach another tenant's projects: the
    // handoff request is served as the local caller.
    let other = TenantContext {
        owner_user_id: Some("victim".into()),
        org_id: Some("victim-org".into()),
        node_id: sidecar.node_id().to_owned(),
    };
    sidecar
        .create_project_for(
            &other,
            "VictimProject".into(),
            "".into(),
            "API".into(),
            "http://127.0.0.1:1".into(),
            Vec::new(),
            None,
            Vec::new(),
        )
        .expect("victim project");
    let http = reqwest::Client::builder().no_proxy().build().unwrap();
    let forged: Value = http
        .get(format!("http://127.0.0.1:{port}/api/checks/projects"))
        .bearer_auth(&handoff.token)
        .header("x-ryu-caller-user-id", "victim")
        .header("x-ryu-caller-org-id", "victim-org")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let body = forged.to_string();
    assert!(
        body.contains("Checkout"),
        "served as the local caller: {body}"
    );
    assert!(
        !body.contains("VictimProject"),
        "no other tenant's data: {body}"
    );
    // Core's ext token keeps the identity Core stamped.
    let as_victim: Value = http
        .get(format!("http://127.0.0.1:{port}/api/checks/projects"))
        .bearer_auth("core-ext-token")
        .header("x-ryu-caller-user-id", "victim")
        .header("x-ryu-caller-org-id", "victim-org")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(as_victim.to_string().contains("VictimProject"));

    // The handoff token opens nothing else.
    let denied = http
        .delete(format!(
            "http://127.0.0.1:{port}/api/checks/projects/{}",
            project.id
        ))
        .bearer_auth(&handoff.token)
        .send()
        .await
        .unwrap();
    assert_eq!(denied.status(), StatusCode::UNAUTHORIZED);

    // A keyless process never writes plaintext over the sealed store.
    assert!(direct
        .create_project_for(
            &TenantContext::local(direct.node_id()),
            "Leak".into(),
            "".into(),
            "API".into(),
            "http://127.0.0.1:1".into(),
            Vec::new(),
            None,
            Vec::new(),
        )
        .is_err());
    assert!(std::fs::read(&state).unwrap().starts_with(b"encb:"));

    sidecar_link::withdraw(&root, &handoff);
    assert!(sidecar_link::SidecarClient::connect(&root).await.is_none());
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn a_compat_process_refuses_to_write_after_the_sidecar_seals() {
    let root = std::env::temp_dir().join(format!("checks-compat-{}", uuid::Uuid::new_v4()));
    let state = root.join("checks.json");
    // Opened first, before any key: a never-sealed store in compat mode.
    let compat = Store::open_with_keys(&state, &PluginKeys::compat()).expect("compat");
    let tenant = TenantContext::local(compat.node_id());
    // Then the sidecar starts with its key and seals the store.
    let sidecar = Store::open_with_keys(&state, &sealing_keys()).expect("sidecar");
    sidecar
        .create_project_for(
            &TenantContext::local(sidecar.node_id()),
            "Sealed".into(),
            "".into(),
            "API".into(),
            "http://127.0.0.1:1".into(),
            Vec::new(),
            None,
            Vec::new(),
        )
        .expect("sealed write");
    let error = compat
        .create_project_for(
            &tenant,
            "Plain".into(),
            "".into(),
            "API".into(),
            "http://127.0.0.1:1".into(),
            Vec::new(),
            None,
            Vec::new(),
        )
        .unwrap_err();
    assert!(error.to_string().contains("sealed"), "{error}");
    let raw = std::fs::read(&state).unwrap();
    assert!(raw.starts_with(b"encb:"));
    assert!(!String::from_utf8_lossy(&raw).contains("Plain"));
    let _ = std::fs::remove_dir_all(root);
}
