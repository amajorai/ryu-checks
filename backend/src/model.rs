use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const SCHEMA_VERSION: u32 = 2;

/// The verified caller context attached by Core plus the server-owned node
/// identity for this sidecar's store.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TenantContext {
    pub owner_user_id: Option<String>,
    pub org_id: Option<String>,
    pub node_id: String,
}

impl TenantContext {
    pub fn local(node_id: impl Into<String>) -> Self {
        Self {
            owner_user_id: None,
            org_id: None,
            node_id: node_id.into(),
        }
    }
}

/// Persisted tenancy metadata. Missing metadata represents legacy ownerless
/// state and deliberately does not match any request tenant.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TenantScope {
    #[serde(default)]
    pub owner_user_id: Option<String>,
    #[serde(default)]
    pub org_id: Option<String>,
    #[serde(default)]
    pub node_id: Option<String>,
}

impl TenantScope {
    pub fn from_context(context: &TenantContext) -> Self {
        Self {
            owner_user_id: context.owner_user_id.clone(),
            org_id: context.org_id.clone(),
            node_id: Some(context.node_id.clone()),
        }
    }

    pub fn matches(&self, context: &TenantContext) -> bool {
        self.node_id.as_deref() == Some(context.node_id.as_str())
            && self.owner_user_id == context.owner_user_id
            && self.org_id == context.org_id
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    #[serde(default)]
    pub tenant: TenantScope,
    pub name: String,
    pub description: String,
    #[serde(rename = "type", alias = "projectType")]
    pub project_type: String,
    pub url: String,
    pub tests: usize,
    pub passed: usize,
    pub attention: usize,
    pub coverage: u8,
    pub status: String,
    pub last_run: String,
    pub next_run: String,
    #[serde(default)]
    pub runtime_selection: Option<Value>,
    #[serde(default)]
    pub context_sources: Vec<ContextSource>,
    #[serde(default)]
    pub latest_run_id: Option<String>,
    #[serde(default)]
    pub latest_exploration_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextSource {
    pub kind: String,
    pub label: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestCase {
    pub id: String,
    #[serde(default)]
    pub tenant: TenantScope,
    pub project_id: String,
    pub name: String,
    pub description: String,
    pub priority: String,
    #[serde(rename = "type", alias = "testType")]
    pub test_type: String,
    pub status: String,
    pub feature: String,
    pub steps: Vec<String>,
    #[serde(default)]
    pub assertions: Vec<String>,
    pub source: String,
    #[serde(default = "default_request_method")]
    pub request_method: String,
    #[serde(default)]
    pub request_path: Option<String>,
    #[serde(default = "default_expected_status")]
    pub expected_status: u16,
    #[serde(default)]
    pub response_assertions: Vec<String>,
    #[serde(default)]
    pub max_response_time_ms: Option<u64>,
    pub updated: String,
    #[serde(default)]
    pub latest_run_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestList {
    pub id: String,
    #[serde(default)]
    pub tenant: TenantScope,
    pub name: String,
    pub description: String,
    pub status: String,
    pub ui_tests: usize,
    pub api_tests: usize,
    pub last_run: String,
    pub next_run: String,
    #[serde(default)]
    pub project_ids: Vec<String>,
    #[serde(default)]
    pub test_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Schedule {
    pub id: String,
    #[serde(default)]
    pub tenant: TenantScope,
    pub name: String,
    pub list_name: String,
    pub frequency: String,
    pub next_run: String,
    pub last_result: String,
    pub active: bool,
    pub list_id: String,
    #[serde(default)]
    pub next_run_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub last_run_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    /// Core-issued permission-specific proof; it contains no human credentials.
    #[serde(default)]
    pub execution_authorization: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunRecord {
    pub id: String,
    #[serde(default)]
    pub tenant: TenantScope,
    pub project_id: String,
    pub status: String,
    pub verdict: String,
    pub trigger: String,
    #[serde(default = "default_run_scope")]
    pub scope: String,
    #[serde(default)]
    pub target_test_id: Option<String>,
    pub started_at: DateTime<Utc>,
    pub finished_at: DateTime<Utc>,
    pub duration_ms: u64,
    pub passed: usize,
    pub failed: usize,
    pub skipped: usize,
    pub coverage: u8,
    pub summary: String,
    pub evidence_level: String,
    pub evidence: Vec<EvidenceRecord>,
    pub failures: Vec<FailureBundle>,
    #[serde(default)]
    pub exploration_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceRecord {
    pub id: String,
    pub test_id: String,
    pub url: String,
    pub status_code: u16,
    pub title: Option<String>,
    pub response_time_ms: u64,
    pub content_type: Option<String>,
    pub text_preview: String,
    pub screenshot_available: bool,
    pub dom_snapshot_available: bool,
    pub level: String,
    pub observed_at: DateTime<Utc>,
    /// For UI cases: why browser evidence is absent (capability not granted,
    /// provider unavailable, capture failed). `None` when browser evidence was
    /// captured or the case is HTTP-only by design (API cases).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub browser_note: Option<String>,
    /// Final URL and title the real browser rendered, when captured.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rendered_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rendered_title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FailureBundle {
    pub id: String,
    pub test_id: String,
    pub title: String,
    pub failed_step: String,
    pub root_cause: String,
    pub suggested_fix: String,
    pub source: String,
    pub evidence_id: String,
    pub screenshot_available: bool,
    pub dom_snapshot: Option<String>,
    #[serde(default = "default_failure_status")]
    pub status: String,
    #[serde(default)]
    pub healed_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub healing_note: Option<String>,
}

fn default_failure_status() -> String {
    "open".to_owned()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorationRecord {
    pub id: String,
    #[serde(default)]
    pub tenant: TenantScope,
    pub project_id: String,
    pub status: String,
    pub target: String,
    pub started_at: DateTime<Utc>,
    pub finished_at: DateTime<Utc>,
    pub pages: Vec<ObservedPage>,
    pub feature_areas: Vec<FeatureArea>,
    pub coverage: u8,
    pub evidence_level: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunRecord {
    pub id: String,
    #[serde(default)]
    pub tenant: TenantScope,
    pub project_id: String,
    pub agent_id: String,
    pub status: String,
    pub verdict: String,
    pub evidence_level: String,
    pub transcript: String,
    pub artifacts: Vec<AgentArtifact>,
    pub started_at: DateTime<Utc>,
    pub finished_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentArtifact {
    pub kind: String,
    pub label: String,
    pub available: bool,
    #[serde(default)]
    pub reference: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObservedPage {
    pub url: String,
    pub title: Option<String>,
    pub status_code: u16,
    pub response_time_ms: u64,
    pub content_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeatureArea {
    pub name: String,
    pub signal: String,
    pub observed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Analytics {
    pub projects: usize,
    pub tests: usize,
    pub runs: usize,
    pub passed: usize,
    pub failed: usize,
    pub coverage: u8,
    pub failure_buckets: Vec<FailureBucket>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FailureBucket {
    pub name: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreState {
    pub schema_version: u32,
    pub projects: Vec<Project>,
    pub tests: Vec<TestCase>,
    pub lists: Vec<TestList>,
    pub schedules: Vec<Schedule>,
    pub runs: Vec<RunRecord>,
    pub explorations: Vec<ExplorationRecord>,
    #[serde(default)]
    pub agent_runs: Vec<AgentRunRecord>,
}

impl Default for StoreState {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            projects: Vec::new(),
            tests: Vec::new(),
            lists: Vec::new(),
            schedules: Vec::new(),
            runs: Vec::new(),
            explorations: Vec::new(),
            agent_runs: Vec::new(),
        }
    }
}

fn default_request_method() -> String {
    "GET".to_owned()
}

fn default_expected_status() -> u16 {
    200
}

fn default_run_scope() -> String {
    "project".to_owned()
}
