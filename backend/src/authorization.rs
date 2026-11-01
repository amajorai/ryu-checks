//! Core retains identity verification and ACL ownership. Checks stores only a
//! permission-specific execution proof and revalidates it before every tick.
use anyhow::{anyhow, Context, Result};
use serde_json::{json, Value};
use std::time::Duration;

use crate::model::TenantContext;

pub const PRINCIPAL_HEADER: &str = "x-ryu-caller-principal-proof";
const PERMISSION: &str = "checks.run";
const APP: &str = "@ryu/checks";

#[derive(Clone)]
pub struct AuthorizationClient {
    endpoint: String,
    token: String,
    http: reqwest::Client,
}

impl AuthorizationClient {
    pub fn new(endpoint: String, token: String) -> Self {
        Self {
            endpoint,
            token,
            http: reqwest::Client::builder()
                // Core is always a node-local authority. Environment proxy
                // settings must never route the bearer or principal proof to
                // an external proxy, nor make a local authorization look like
                // a permission denial when that proxy refuses loopback.
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(15))
                .build()
                .expect("authorization client"),
        }
    }

    pub fn from_env() -> Option<Self> {
        let port = std::env::var("RYU_CORE_PORT").ok()?.parse::<u16>().ok()?;
        let token = std::env::var("RYU_EXT_TOKEN").ok()?.trim().to_owned();
        if token.is_empty() {
            return None;
        }
        Some(Self::new(
            format!("http://127.0.0.1:{port}/api/host/rpc"),
            token,
        ))
    }

    async fn call(&self, tenant: &TenantContext, method: &str, proof: &str) -> Result<Value> {
        let mut response = self.http.post(&self.endpoint)
            .bearer_auth(&self.token).header("x-ryu-plugin-id", APP)
            .json(&json!({ "method": method, "args": { "proof": proof, "permission": PERMISSION, "resource": APP } }))
            .send().await?.error_for_status()?;
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await? {
            if bytes.len() + chunk.len() > 65_536 {
                return Err(anyhow!("execution authorization response is too large"));
            }
            bytes.extend_from_slice(&chunk);
        }
        let payload: Value = serde_json::from_slice(&bytes)?;
        let result = payload
            .get("result")
            .context("execution authorization unavailable")?;
        if result.get("userId").and_then(Value::as_str) != tenant.owner_user_id.as_deref()
            || result.get("orgId").and_then(Value::as_str) != tenant.org_id.as_deref()
        {
            return Err(anyhow!(
                "execution principal does not match schedule tenant"
            ));
        }
        Ok(result.clone())
    }

    pub async fn issue(&self, tenant: &TenantContext, principal: &str) -> Result<String> {
        self.call(tenant, "authorization.issue", principal)
            .await?
            .get("proof")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .context("execution authorization unavailable")
    }

    pub async fn check(&self, tenant: &TenantContext, proof: &str) -> Result<()> {
        let result = self.call(tenant, "authorization.check", proof).await?;
        if result.get("allowed").and_then(Value::as_bool) != Some(true) {
            return Err(anyhow!("execution permission denied"));
        }
        Ok(())
    }
}

pub fn local_owner(tenant: &TenantContext) -> bool {
    !crate::paths::is_managed_node() && tenant.owner_user_id.is_none() && tenant.org_id.is_none()
}

pub async fn issue(
    client: Option<&AuthorizationClient>,
    tenant: &TenantContext,
    principal: Option<&str>,
) -> Result<Option<String>> {
    match client {
        Some(client) => Ok(Some(
            client
                .issue(
                    tenant,
                    principal.context("verified execution principal required")?,
                )
                .await?,
        )),
        None if local_owner(tenant) => Ok(None),
        None => Err(anyhow!("execution authorization unavailable")),
    }
}
