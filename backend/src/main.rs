use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;
use std::time::Duration;

use axum::extract::Request;
use axum::http::StatusCode;
use axum::middleware::{from_fn, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, BufWriter};
use tokio::time::interval;

use chrono::Utc;
use ryu_checks::{paths, routes, service, sidecar_link, Ctx, Store, TenantContext};
use ryu_sidecar_runtime::mcp_protocol::{
    discover_result, finalize_response, protocol_error, request_is_modern, PROTOCOL_VERSION,
};

const DEFAULT_PORT: u16 = 8042;
fn main() -> anyhow::Result<()> {
    // Take the sealing key Core delivered out of the environment before any
    // thread starts (the async runtime spawns workers).
    ryu_checks::seal_keys::capture()?;
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?
        .block_on(run())
}

async fn run() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();
    let state_path = paths::state_path();
    let data_dir = state_path
        .parent()
        .map(std::path::Path::to_path_buf)
        .unwrap_or_else(paths::data_dir);
    let mode = std::env::args().nth(1);
    if let Some(mode) = mode
        .as_deref()
        .filter(|mode| matches!(*mode, "mcp" | "run" | "analytics" | "list"))
    {
        return run_client_mode(mode, &data_dir, state_path).await;
    }
    let keys = ryu_checks::seal_keys::PluginKeys::resolve(ryu_checks::store::PLUGIN_ID, &data_dir)?;
    let store = Store::open_with_keys(state_path, &keys)?;
    let port = std::env::var("RYU_CHECKS_PORT")
        .ok()
        .and_then(|value| value.trim().parse().ok())
        .unwrap_or(DEFAULT_PORT);
    let token = std::env::var("RYU_EXT_TOKEN")
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty());
    tokio::spawn(schedule_loop(store.clone()));
    store.seal_legacy_evidence_in_background();
    let seal_health = store.seal_health();
    let ctx = Arc::new(Ctx { store });
    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let listener = tokio::net::TcpListener::bind(address).await?;
    tracing::info!(%address, "ryu-checks sidecar listening");
    // Publish the loopback handoff for the `mcp` server and CLI modes, which
    // hold no sealing key (see `sidecar_link`). A managed node has no local
    // caller (those modes refuse to run there), so it publishes none.
    let handoff = if paths::is_managed_node() {
        None
    } else {
        Some(sidecar_link::publish(
            &data_dir,
            listener.local_addr()?.port(),
        )?)
    };
    let handoff_token = handoff.as_ref().map(|handoff| handoff.token.clone());
    let protected = Router::new()
        .nest("/api/checks", routes(ctx))
        .layer(from_fn(move |request: Request, next: Next| {
            let expected = token.clone();
            let handoff_token = handoff_token.clone();
            async move {
                require_token(request, next, expected.as_deref(), handoff_token.as_deref()).await
            }
        }));
    let app = Router::new()
        .route("/health", get(move || health(seal_health.clone())))
        .merge(protected);
    let served = axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await;
    if let Some(handoff) = &handoff {
        sidecar_link::withdraw(&data_dir, handoff);
    }
    served?;
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        () = ctrl_c => {},
        () = terminate => {},
    }
}

/// Where a second process (the `mcp` server Core spawns, or a CLI run) reads
/// and runs Checks: the running sidecar when one answers (it holds the
/// sealing key), else the store opened directly.
enum Backend {
    Sidecar(sidecar_link::SidecarClient),
    Direct(Store),
}

struct ClientMode {
    data_dir: std::path::PathBuf,
    store: Store,
    tenant: TenantContext,
}

impl ClientMode {
    async fn backend(&self) -> anyhow::Result<Backend> {
        if let Some(client) = sidecar_link::SidecarClient::connect(&self.data_dir).await {
            return Ok(Backend::Sidecar(client));
        }
        if self.store.seal_health()["state"] == "unhealthy" {
            anyhow::bail!(
                "Checks data is sealed and only the Tests app sidecar holds its key; start the \
                 Tests app (or Ryu) and try again"
            );
        }
        Ok(Backend::Direct(self.store.clone()))
    }

    async fn run_project(&self, project_id: &str, trigger: &str) -> anyhow::Result<Value> {
        match self.backend().await? {
            Backend::Sidecar(client) => client.run_project(project_id, trigger).await,
            Backend::Direct(store) => {
                let run =
                    service::run_project_for(&store, &self.tenant, project_id, trigger).await?;
                Ok(serde_json::to_value(run)?)
            }
        }
    }

    async fn analytics(&self) -> anyhow::Result<Value> {
        match self.backend().await? {
            Backend::Sidecar(client) => client.analytics().await,
            Backend::Direct(store) => Ok(serde_json::to_value(store.analytics_for(&self.tenant))?),
        }
    }

    async fn projects(&self) -> anyhow::Result<Vec<Value>> {
        match self.backend().await? {
            Backend::Sidecar(client) => client.projects().await,
            Backend::Direct(store) => store
                .snapshot_for(&self.tenant)
                .projects
                .into_iter()
                .map(|project| serde_json::to_value(project).map_err(Into::into))
                .collect(),
        }
    }
}

async fn run_client_mode(
    mode: &str,
    data_dir: &std::path::Path,
    state_path: std::path::PathBuf,
) -> anyhow::Result<()> {
    // These modes share the sidecar's store and never generate a standalone
    // root: they would otherwise seal under a key the sidecar does not hold.
    let keys = ryu_checks::seal_keys::PluginKeys::resolve_existing(
        ryu_checks::store::PLUGIN_ID,
        data_dir,
    )?;
    let store = Store::open_with_keys(state_path, &keys)?;
    let tenant = local_tenant(&store)?;
    let client = ClientMode {
        data_dir: data_dir.to_path_buf(),
        store,
        tenant,
    };
    match mode {
        "mcp" => serve_mcp(&client).await,
        "run" => run_cli(&client).await,
        "analytics" => analytics_cli(&client).await,
        _ => list_cli(&client).await,
    }
}

async fn run_cli(client: &ClientMode) -> anyhow::Result<()> {
    let args = std::env::args().skip(2).collect::<Vec<_>>();
    let project_id = option_value(&args, "--project-id")
        .or_else(|| args.first().cloned())
        .ok_or_else(|| {
            anyhow::anyhow!("usage: ryu-checks run --project-id <id> [--trigger <name>]")
        })?;
    let trigger = option_value(&args, "--trigger").unwrap_or_else(|| "cli".to_owned());
    let run = client.run_project(&project_id, &trigger).await?;
    println!("{}", serde_json::to_string_pretty(&run)?);
    if run.get("failed").and_then(Value::as_u64).unwrap_or(0) > 0 {
        std::process::exit(1);
    }
    Ok(())
}

async fn analytics_cli(client: &ClientMode) -> anyhow::Result<()> {
    println!(
        "{}",
        serde_json::to_string_pretty(&client.analytics().await?)?
    );
    Ok(())
}

async fn list_cli(client: &ClientMode) -> anyhow::Result<()> {
    let projects = client
        .projects()
        .await?
        .into_iter()
        .map(|project| {
            json!({
                "id": project.get("id"),
                "name": project.get("name"),
                "type": project.get("type"),
                "url": project.get("url"),
                "status": project.get("status"),
                "latestRunId": project.get("latestRunId"),
            })
        })
        .collect::<Vec<_>>();
    println!("{}", serde_json::to_string_pretty(&projects)?);
    Ok(())
}

async fn schedule_loop(store: Store) {
    let mut ticker = interval(Duration::from_secs(15));
    loop {
        ticker.tick().await;
        for schedule in store.due_schedules(Utc::now()) {
            let result = match service::run_scheduled_list(
                &store,
                &schedule,
                ryu_checks::authorization::AuthorizationClient::from_env().as_ref(),
            )
            .await
            {
                Ok(runs) if runs.iter().all(|run| run.failed == 0) => "passed",
                Ok(_) => "attention",
                Err(error) => {
                    tracing::warn!(
                        schedule_id = %schedule.id,
                        %error,
                        "Checks schedule run failed"
                    );
                    "failed"
                }
            };
            if let Err(error) = store.record_schedule_run(&schedule.id, result, Utc::now()) {
                tracing::warn!(
                    schedule_id = %schedule.id,
                    %error,
                    "Checks schedule state could not be saved"
                );
            }
        }
    }
}

fn option_value(args: &[String], name: &str) -> Option<String> {
    args.iter()
        .position(|argument| argument == name)
        .and_then(|index| args.get(index + 1))
        .cloned()
}

async fn serve_mcp(client: &ClientMode) -> anyhow::Result<()> {
    let stdin = BufReader::new(tokio::io::stdin());
    let mut lines = stdin.lines();
    let mut stdout = BufWriter::new(tokio::io::stdout());
    let mut legacy_initialized = false;
    while let Some(line) = lines.next_line().await? {
        if line.trim().is_empty() {
            continue;
        }
        let request: Value = serde_json::from_str(&line)?;
        let method = request
            .get("method")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if method == "notifications/initialized" {
            continue;
        }
        let id = request.get("id").cloned().unwrap_or(Value::Null);
        let modern = match request_is_modern(&request, method, legacy_initialized) {
            Ok(modern) => modern,
            Err(error) => {
                let response = protocol_error(id, error);
                stdout
                    .write_all(serde_json::to_string(&response)?.as_bytes())
                    .await?;
                stdout.write_all(b"\n").await?;
                stdout.flush().await?;
                continue;
            }
        };
        legacy_initialized |= method == "initialize" && !modern;
        let response = match method {
            "initialize" if modern => json!({
                "jsonrpc": "2.0",
                "id": id,
                "error": { "code": -32601, "message": "unknown method 'initialize'" }
            }),
            "server/discover" => json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": discover_result()
            }),
            "initialize" => json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": {
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": { "tools": {} },
                    "serverInfo": { "name": "ryu-checks", "version": env!("CARGO_PKG_VERSION") }
                }
            }),
            "tools/list" => json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": { "tools": mcp_tools() }
            }),
            "ping" if !modern => json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": {}
            }),
            "ping" => json!({
                "jsonrpc": "2.0",
                "id": id,
                "error": { "code": -32601, "message": "unknown method 'ping'" }
            }),
            "tools/call" => {
                mcp_call(
                    client,
                    id.clone(),
                    request.get("params").cloned().unwrap_or_default(),
                )
                .await
            }
            _ => json!({
                "jsonrpc": "2.0",
                "id": id,
                "error": { "code": -32601, "message": format!("unknown method: {method}") }
            }),
        };
        let response = finalize_response(
            response,
            modern,
            method,
            "ryu-checks",
            env!("CARGO_PKG_VERSION"),
        );
        stdout
            .write_all(serde_json::to_string(&response)?.as_bytes())
            .await?;
        stdout.write_all(b"\n").await?;
        stdout.flush().await?;
    }
    Ok(())
}

fn local_tenant(store: &Store) -> anyhow::Result<TenantContext> {
    if paths::is_managed_node() {
        anyhow::bail!("Checks CLI and MCP require an authenticated caller on a managed node");
    }
    Ok(TenantContext::local(store.node_id()))
}

fn mcp_tools() -> Vec<Value> {
    vec![
        json!({
            "name": "run_project",
            "description": "Run one persisted Checks project and return its retained evidence and failure bundles.",
            "inputSchema": {
                "type": "object",
                "required": ["project_id"],
                "properties": {
                    "project_id": { "type": "string" },
                    "trigger": { "type": "string" }
                }
            }
        }),
        json!({
            "name": "analytics",
            "description": "Read Checks totals, coverage, and failure buckets.",
            "inputSchema": { "type": "object", "properties": {} }
        }),
    ]
}

async fn mcp_call(client: &ClientMode, id: Value, params: Value) -> Value {
    let name = params
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let arguments = params
        .get("arguments")
        .cloned()
        .unwrap_or_else(|| json!({}));
    let result = match name {
        "run_project" | "checks.run_project" => {
            let project_id = arguments.get("project_id").and_then(Value::as_str);
            let trigger = arguments
                .get("trigger")
                .and_then(Value::as_str)
                .unwrap_or("mcp");
            match project_id {
                Some(project_id) => client
                    .run_project(project_id, trigger)
                    .await
                    .map_err(|error| error.to_string()),
                None => Err("project_id is required".to_owned()),
            }
        }
        "analytics" | "checks.analytics" => {
            client.analytics().await.map_err(|error| error.to_string())
        }
        _ => Err(format!("unknown tool: {name}")),
    };
    match result {
        Ok(value) => json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": { "content": [{ "type": "text", "text": value.to_string() }] }
        }),
        Err(error) => json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": { "isError": true, "content": [{ "type": "text", "text": error }] }
        }),
    }
}

async fn health(sealing: serde_json::Value) -> Json<serde_json::Value> {
    Json(json!({
        "ok": true,
        "name": "ryu-checks",
        "version": env!("CARGO_PKG_VERSION"),
        "sealing": sealing,
    }))
}

async fn require_token(
    request: Request,
    next: Next,
    expected: Option<&str>,
    handoff_token: Option<&str>,
) -> Response {
    match sidecar_link::admit(request, expected, handoff_token) {
        Some(request) => next.run(request).await,
        None => (StatusCode::UNAUTHORIZED, "unauthorized").into_response(),
    }
}
