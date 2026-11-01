//! Real-browser evidence through the generic `browser.control` capability.
//!
//! Checks never links to the Browser app and Core has no Checks-specific browser
//! client. The sidecar asks Core's capability broker for the abstract capability it
//! declared in `manifest.json` (`requires.capabilities: browser.control`):
//!
//! ```text
//! POST http://127.0.0.1:$RYU_CORE_PORT/api/host/capability/browser.control
//!   authorization: Bearer $RYU_EXT_TOKEN
//!   x-ryu-plugin-id: @ryu/checks
//!   { "tool": "browser.navigate", "args": { "url": "https://…" } }
//! ```
//!
//! Core authenticates this sidecar, checks the declared edge and the approved
//! `browser:control` grant, then forwards the `{tool,args}` envelope to whichever
//! enabled app provides the capability. `browser:control` is a required grant and
//! `browser.control` a required capability, so Core refuses to enable Checks when
//! the grant is denied; a denied grant never reaches this lane. Any refusal at
//! call time — no Core (standalone CLI), no enabled provider, Browser control
//! turned off, a target the browser refuses to open (it never opens localhost,
//! loopback, or private addresses) — is reported as [`BrowserError`] and the
//! runner keeps its HTTP-only verdict with truthful evidence flags.

use std::time::Duration;

use base64::Engine as _;
use reqwest::StatusCode;
use serde_json::{json, Value};

/// The abstract capability this sidecar requires. Must match `manifest.json`.
pub const CAPABILITY: &str = "browser.control";
const PLUGIN_ID: &str = "@ryu/checks";
/// Bound every broker response; a full-page PNG is the largest expected reply.
const MAX_RESPONSE_BYTES: usize = 24 * 1024 * 1024;
/// Bound the retained decoded screenshot.
pub const MAX_SCREENSHOT_BYTES: usize = 12 * 1024 * 1024;
/// Bound the retained accessibility/DOM snapshot document.
pub const MAX_DOM_SNAPSHOT_BYTES: usize = 2 * 1024 * 1024;
const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";

#[derive(Debug, thiserror::Error)]
pub enum BrowserError {
    /// The capability is not reachable for this sidecar: Core is absent, the
    /// grant is not held, no provider is enabled, or Browser control is off.
    #[error("browser capability unavailable: {0}")]
    Unavailable(String),
    /// The browser was reachable but the journey did not produce evidence.
    #[error("browser capture failed: {0}")]
    Failed(String),
}

/// One captured page: what the user would have seen and the structure behind it.
#[derive(Debug, Clone)]
pub struct BrowserCapture {
    pub final_url: Option<String>,
    pub title: Option<String>,
    /// Decoded PNG bytes.
    pub screenshot_png: Vec<u8>,
    /// The browser's accessibility-tree DOM snapshot (`{elements,tab,truncated,…}`).
    pub dom_snapshot: Value,
    /// Lower-cased visible names/values from the snapshot, for signal matching.
    pub rendered_text: String,
}

#[derive(Clone)]
pub struct BrowserClient {
    endpoint: String,
    token: String,
    http: reqwest::Client,
    settle_timeout: Duration,
    poll_interval: Duration,
}

impl BrowserClient {
    /// `base_url` is Core's loopback origin (e.g. `http://127.0.0.1:7980`).
    pub fn new(base_url: &str, token: impl Into<String>) -> Self {
        Self {
            endpoint: format!(
                "{}/api/host/capability/{CAPABILITY}",
                base_url.trim_end_matches('/')
            ),
            token: token.into(),
            http: reqwest::Client::builder()
                // Core is node-local; never route the sidecar bearer through an
                // ambient proxy.
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(45))
                .build()
                .expect("browser capability client"),
            settle_timeout: Duration::from_secs(15),
            poll_interval: Duration::from_millis(400),
        }
    }

    /// Built from the pair Core injects at spawn. `None` outside Core (tests,
    /// standalone CLI without a host), which the runner reports as unavailable.
    pub fn from_env() -> Option<Self> {
        let port = std::env::var("RYU_CORE_PORT")
            .ok()?
            .trim()
            .parse::<u16>()
            .ok()?;
        let token = std::env::var("RYU_EXT_TOKEN").ok()?.trim().to_owned();
        if token.is_empty() {
            return None;
        }
        Some(Self::new(&format!("http://127.0.0.1:{port}"), token))
    }

    /// Shorten the page-settle wait (tests use a mock that is ready at once).
    pub fn with_timing(mut self, settle_timeout: Duration, poll_interval: Duration) -> Self {
        self.settle_timeout = settle_timeout;
        self.poll_interval = poll_interval;
        self
    }

    async fn call(&self, tool: &str, args: Value) -> Result<Value, BrowserError> {
        let response = self
            .http
            .post(&self.endpoint)
            .bearer_auth(&self.token)
            .header("x-ryu-plugin-id", PLUGIN_ID)
            .json(&json!({ "tool": tool, "args": args }))
            .send()
            .await
            .map_err(|error| BrowserError::Unavailable(format!("{tool}: {error}")))?;
        let status = response.status();
        if response
            .content_length()
            .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
        {
            return Err(BrowserError::Failed(format!(
                "{tool}: response is too large"
            )));
        }
        let mut response = response;
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| BrowserError::Failed(format!("{tool}: {error}")))?
        {
            if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
                return Err(BrowserError::Failed(format!(
                    "{tool}: response is too large"
                )));
            }
            bytes.extend_from_slice(&chunk);
        }
        let payload: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
        if !status.is_success() || payload.get("ok") == Some(&Value::Bool(false)) {
            let detail = payload
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("request rejected")
                .chars()
                .take(240)
                .collect::<String>();
            let message = format!("{tool}: {} {detail}", status.as_u16());
            return Err(match status {
                StatusCode::UNAUTHORIZED
                | StatusCode::FORBIDDEN
                | StatusCode::NOT_FOUND
                | StatusCode::CONFLICT
                | StatusCode::SERVICE_UNAVAILABLE => BrowserError::Unavailable(message),
                _ => BrowserError::Failed(message),
            });
        }
        Ok(payload)
    }

    /// Open `url` in a fresh tab, wait for the rendered tree to settle, then
    /// capture a screenshot and DOM snapshot.
    pub async fn capture(&self, url: &str) -> Result<BrowserCapture, BrowserError> {
        let opened = self.call("browser.navigate", json!({ "url": url })).await?;
        let tab_id = opened
            .pointer("/tab/id")
            .and_then(Value::as_str)
            .filter(|id| !id.trim().is_empty())
            .ok_or_else(|| BrowserError::Failed("browser did not return a tab id".to_owned()))?
            .to_owned();
        let captured = self.capture_tab(&tab_id).await;
        // Best-effort cleanup whether or not the capture succeeded, so evidence
        // tabs do not accumulate in the provider's browser. A failed close never
        // changes the capture result.
        if let Err(error) = self
            .call("browser.close_tab", json!({ "tab_id": tab_id }))
            .await
        {
            tracing::debug!(%error, tab_id = %tab_id, "could not close evidence tab");
        }
        captured
    }

    async fn capture_tab(&self, tab_id: &str) -> Result<BrowserCapture, BrowserError> {
        let deadline = tokio::time::Instant::now() + self.settle_timeout;
        let mut previous_count: Option<usize> = None;
        let snapshot = loop {
            let snapshot = self
                .call("browser.snapshot", json!({ "tab_id": tab_id }))
                .await?;
            let count = snapshot
                .get("elements")
                .and_then(Value::as_array)
                .map_or(0, Vec::len);
            let url = snapshot
                .pointer("/tab/url")
                .and_then(Value::as_str)
                .unwrap_or("about:blank");
            // Settled = navigated away from about:blank and the rendered tree
            // stopped growing between two polls.
            let settled = url != "about:blank" && count > 0 && previous_count == Some(count);
            if settled || tokio::time::Instant::now() >= deadline {
                break snapshot;
            }
            previous_count = Some(count);
            tokio::time::sleep(self.poll_interval).await;
        };
        let shot = self
            .call("browser.screenshot", json!({ "tab_id": tab_id }))
            .await?;
        let encoded = shot
            .get("image")
            .and_then(Value::as_str)
            .ok_or_else(|| BrowserError::Failed("screenshot had no image".to_owned()))?;
        let screenshot_png = base64::engine::general_purpose::STANDARD
            .decode(encoded.trim())
            .map_err(|error| BrowserError::Failed(format!("screenshot is not base64: {error}")))?;
        if !screenshot_png.starts_with(PNG_SIGNATURE) {
            return Err(BrowserError::Failed("screenshot is not a PNG".to_owned()));
        }
        if screenshot_png.len() > MAX_SCREENSHOT_BYTES {
            return Err(BrowserError::Failed("screenshot is too large".to_owned()));
        }
        Ok(BrowserCapture {
            final_url: snapshot
                .pointer("/tab/url")
                .and_then(Value::as_str)
                .map(str::to_owned),
            title: snapshot
                .pointer("/tab/title")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|title| !title.is_empty())
                .map(|title| title.chars().take(160).collect()),
            rendered_text: rendered_text(&snapshot),
            screenshot_png,
            dom_snapshot: snapshot,
        })
    }
}

/// Visible names and values from an accessibility snapshot, lower-cased and
/// whitespace-normalised so the runner can match the same signals it matches in
/// the HTTP body.
pub fn rendered_text(snapshot: &Value) -> String {
    snapshot
        .get("elements")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .flat_map(|element| {
            ["name", "value"]
                .into_iter()
                .filter_map(|key| element.get(key).and_then(Value::as_str))
        })
        .flat_map(str::split_whitespace)
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rendered_text_collects_names_and_values() {
        let snapshot = json!({
            "elements": [
                { "ref": "@e1", "role": "heading", "name": "Sign  In" },
                { "ref": "@e2", "role": "textbox", "value": "Search" },
                { "ref": "@e3", "role": "generic" }
            ]
        });
        assert_eq!(rendered_text(&snapshot), "sign in search");
    }

    #[test]
    fn from_env_requires_core_wiring() {
        // The test process is not spawned by Core, so the broker is unknown.
        if std::env::var("RYU_CORE_PORT").is_err() {
            assert!(BrowserClient::from_env().is_none());
        }
    }
}
