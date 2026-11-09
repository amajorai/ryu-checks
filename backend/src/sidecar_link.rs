//! Let a second process reach the store through the running sidecar.
//!
//! `checks.json` is sealed with the plugin subkey Core delivers to the sidecar
//! only. The `ryu-checks mcp` server Core registers from the manifest, and the
//! `run`/`analytics`/`list` CLI modes, get no key, so they cannot open a store
//! the sidecar has sealed. Instead of reading the file they call the sidecar:
//!
//! - at startup the sidecar writes `secrets/sidecar-handoff.json` (0600) under
//!   its plugin data dir: its loopback port and a random token minted for this
//!   run (never the Core ext token);
//! - that token opens only the routes listed in [`HANDOFF_ROUTES`], as the
//!   local caller (the same tenant the CLI and MCP modes already use);
//! - the file is replaced on every start and removed on shutdown, so a copied
//!   data dir or backup carries no usable credential once the sidecar restarts.
//!
//! When no sidecar answers, the caller falls back to opening the store itself
//! (which works for a store that is unsealed or whose key it holds).

use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{anyhow, bail, Context, Result};
use base64::Engine as _;
use rand::RngCore as _;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// The handoff file, under `<plugin data dir>/secrets/`.
pub const HANDOFF_FILE: &str = "sidecar-handoff.json";

/// The `(method, path)` pairs the handoff token may call.
pub const HANDOFF_ROUTES: &[(&str, &str)] = &[
    ("POST", "/api/checks/tools/run_project"),
    ("GET", "/api/checks/tools/analytics"),
    ("GET", "/api/checks/projects"),
];

const PROBE_TIMEOUT: Duration = Duration::from_secs(2);

/// What the sidecar publishes for local callers.
#[derive(Clone, Serialize, Deserialize)]
pub struct Handoff {
    pub port: u16,
    pub token: String,
    pub pid: u32,
}

impl std::fmt::Debug for Handoff {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Handoff")
            .field("port", &self.port)
            .field("pid", &self.pid)
            .finish_non_exhaustive()
    }
}

/// The handoff file path for a plugin data dir.
pub fn handoff_path(data_dir: &Path) -> PathBuf {
    data_dir.join("secrets").join(HANDOFF_FILE)
}

/// Mint a token for this run and publish it with `port` (sidecar only).
pub fn publish(data_dir: &Path, port: u16) -> Result<Handoff> {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let handoff = Handoff {
        port,
        token: base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes),
        pid: std::process::id(),
    };
    let path = handoff_path(data_dir);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
    }
    let body = serde_json::to_vec(&handoff).context("serialize the sidecar handoff")?;
    crate::seal_keys::write_private_file(&path, &body)?;
    Ok(handoff)
}

/// Remove the handoff this process published (best effort, on shutdown).
pub fn withdraw(data_dir: &Path, handoff: &Handoff) {
    let path = handoff_path(data_dir);
    if load(data_dir).is_some_and(|current| current.token == handoff.token) {
        let _ = std::fs::remove_file(path);
    }
}

/// Read the published handoff, if any.
pub fn load(data_dir: &Path) -> Option<Handoff> {
    let bytes = std::fs::read(handoff_path(data_dir)).ok()?;
    serde_json::from_slice(&bytes).ok()
}

/// Which credential a request carried.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Caller {
    /// The Core ext token: Core stamped any caller identity headers.
    Core,
    /// The handoff token: a local process on this node, never another tenant.
    Handoff,
    /// Neither token matched (or the route is closed to the handoff token).
    Denied,
}

/// Which caller a request is: the Core ext token opens every route; the
/// handoff token opens only [`HANDOFF_ROUTES`].
pub fn authorize(
    provided: Option<&str>,
    ext_token: Option<&str>,
    handoff_token: Option<&str>,
    method: &str,
    path: &str,
) -> Caller {
    if ryu_sidecar_runtime::token_ok(provided, ext_token) {
        return Caller::Core;
    }
    let (Some(provided), Some(handoff)) = (provided, handoff_token) else {
        return Caller::Denied;
    };
    let path = path.trim_end_matches('/');
    let route_open = HANDOFF_ROUTES.iter().any(|(allowed_method, allowed_path)| {
        method.eq_ignore_ascii_case(allowed_method) && path == *allowed_path
    });
    if route_open && ryu_sidecar_runtime::token_ok(Some(provided), Some(handoff)) {
        Caller::Handoff
    } else {
        Caller::Denied
    }
}

/// The caller identity headers only Core may set. Core strips caller copies
/// on the ext-proxy path and stamps verified values; a handoff request never
/// passes through Core, so its copies are forgeries.
pub const CORE_STAMPED_HEADERS: &[&str] = &[
    crate::api::CALLER_USER_ID_HEADER,
    crate::api::CALLER_ORG_ID_HEADER,
    crate::authorization::PRINCIPAL_HEADER,
];

/// Gate a sidecar request. Returns the request to serve, or `None` when it
/// must be refused with 401. A handoff request is served as the local caller:
/// every Core-stamped identity header is removed, so a process holding the
/// handoff token cannot name another tenant.
pub fn admit(
    mut request: axum::extract::Request,
    ext_token: Option<&str>,
    handoff_token: Option<&str>,
) -> Option<axum::extract::Request> {
    let provided = request
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "));
    match authorize(
        provided,
        ext_token,
        handoff_token,
        request.method().as_str(),
        request.uri().path(),
    ) {
        Caller::Core => Some(request),
        Caller::Handoff => {
            let headers = request.headers_mut();
            for name in CORE_STAMPED_HEADERS {
                headers.remove(*name);
            }
            Some(request)
        }
        Caller::Denied => None,
    }
}

/// A client for the running sidecar's handoff routes.
#[derive(Clone)]
pub struct SidecarClient {
    base: String,
    token: String,
    http: reqwest::Client,
}

impl std::fmt::Debug for SidecarClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SidecarClient")
            .field("base", &self.base)
            .finish_non_exhaustive()
    }
}

impl SidecarClient {
    /// Connect to the sidecar that published a handoff in `data_dir`, when it
    /// answers its health probe.
    pub async fn connect(data_dir: &Path) -> Option<Self> {
        let handoff = load(data_dir)?;
        let client = Self::new(handoff.port, handoff.token).ok()?;
        let probe = client
            .http
            .get(format!("{}/health", client.base))
            .timeout(PROBE_TIMEOUT)
            .send()
            .await
            .ok()?;
        probe.status().is_success().then_some(client)
    }

    fn new(port: u16, token: String) -> Result<Self> {
        // Loopback only: never route through a host proxy.
        let http = reqwest::Client::builder()
            .no_proxy()
            .build()
            .context("build the loopback client")?;
        Ok(Self {
            base: format!("http://127.0.0.1:{port}"),
            token,
            http,
        })
    }

    async fn send(&self, request: reqwest::RequestBuilder) -> Result<Value> {
        let response = request
            .bearer_auth(&self.token)
            .send()
            .await
            .context("call the Checks sidecar")?;
        let status = response.status();
        let body: Value = response.json().await.unwrap_or(Value::Null);
        if !status.is_success() {
            let message = body
                .get("error")
                .and_then(|error| error.get("message").or(Some(error)))
                .and_then(Value::as_str)
                .map_or_else(|| status.to_string(), str::to_owned);
            bail!("Checks sidecar: {message}");
        }
        Ok(body)
    }

    /// Run one project (`POST /api/checks/tools/run_project`).
    pub async fn run_project(&self, project_id: &str, trigger: &str) -> Result<Value> {
        self.send(
            self.http
                .post(format!("{}/api/checks/tools/run_project", self.base))
                .json(&json!({ "projectId": project_id, "trigger": trigger })),
        )
        .await
    }

    /// Analytics (`GET /api/checks/tools/analytics`).
    pub async fn analytics(&self) -> Result<Value> {
        self.send(
            self.http
                .get(format!("{}/api/checks/tools/analytics", self.base))
                .timeout(Duration::from_secs(30)),
        )
        .await
    }

    /// The local caller's projects (`GET /api/checks/projects`).
    pub async fn projects(&self) -> Result<Vec<Value>> {
        let body = self
            .send(
                self.http
                    .get(format!("{}/api/checks/projects", self.base))
                    .timeout(Duration::from_secs(30)),
            )
            .await?;
        body.get("projects")
            .and_then(Value::as_array)
            .cloned()
            .ok_or_else(|| anyhow!("Checks sidecar returned no project list"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("checks-handoff-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn handoff_is_private_replaced_and_withdrawn_only_by_its_owner() {
        let dir = tmp();
        let first = publish(&dir, 4100).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt as _;
            let mode = std::fs::metadata(handoff_path(&dir))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o600);
        }
        let second = publish(&dir, 4101).unwrap();
        assert_ne!(first.token, second.token);
        withdraw(&dir, &first);
        assert_eq!(load(&dir).unwrap().port, 4101, "a stale owner keeps out");
        withdraw(&dir, &second);
        assert!(load(&dir).is_none());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn handoff_token_opens_only_the_listed_routes() {
        let ext = Some("ext-token");
        let handoff = Some("handoff-token");
        assert_eq!(
            Caller::Core,
            authorize(
                Some("ext-token"),
                ext,
                handoff,
                "DELETE",
                "/api/checks/projects/p1"
            )
        );
        assert_eq!(
            Caller::Handoff,
            authorize(
                Some("handoff-token"),
                ext,
                handoff,
                "POST",
                "/api/checks/tools/run_project"
            )
        );
        assert_eq!(
            Caller::Handoff,
            authorize(
                Some("handoff-token"),
                ext,
                handoff,
                "GET",
                "/api/checks/tools/analytics"
            )
        );
        assert_eq!(
            Caller::Denied,
            authorize(
                Some("handoff-token"),
                ext,
                handoff,
                "DELETE",
                "/api/checks/projects/p1"
            )
        );
        assert_eq!(
            Caller::Denied,
            authorize(
                Some("handoff-token"),
                ext,
                handoff,
                "GET",
                "/api/checks/runs/r1"
            )
        );
        assert_eq!(
            Caller::Denied,
            authorize(
                Some("wrong"),
                ext,
                handoff,
                "GET",
                "/api/checks/tools/analytics"
            )
        );
        assert_eq!(
            Caller::Denied,
            authorize(None, ext, handoff, "GET", "/api/checks/tools/analytics")
        );
    }

    #[test]
    fn a_handoff_request_loses_every_core_stamped_header() {
        let forged = |token: &str| {
            let mut builder = axum::http::Request::builder()
                .method("GET")
                .uri("/api/checks/projects")
                .header("authorization", format!("Bearer {token}"));
            for name in CORE_STAMPED_HEADERS {
                builder = builder.header(*name, "victim");
            }
            builder.body(axum::body::Body::empty()).unwrap()
        };
        let ext = Some("ext-token");
        let handoff = Some("handoff-token");

        let admitted = admit(forged("handoff-token"), ext, handoff).expect("handoff admitted");
        for name in CORE_STAMPED_HEADERS {
            assert!(
                admitted.headers().get(*name).is_none(),
                "{name} was stripped"
            );
        }
        // Core's own request keeps the identity Core stamped.
        let core = admit(forged("ext-token"), ext, handoff).expect("core admitted");
        for name in CORE_STAMPED_HEADERS {
            assert_eq!(core.headers()[*name], "victim");
        }
        // No handoff published (a managed node): the handoff token opens nothing.
        assert!(admit(forged("handoff-token"), ext, None).is_none());
    }
}
