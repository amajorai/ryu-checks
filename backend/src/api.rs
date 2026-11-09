use std::sync::Arc;

use axum::extract::{Extension, Path, Request, State};
use axum::http::{HeaderMap, StatusCode};
use axum::middleware::{from_fn, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, patch, post};
use axum::{Json, Router};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::model::{
    AgentArtifact, AgentRunRecord, Analytics, ExplorationRecord, Project, RunRecord, Schedule,
    StoreState, TenantContext, TestList,
};
use crate::paths;
use crate::runner;
use crate::store::Store;

pub struct Ctx {
    pub store: Store,
}

pub const CALLER_USER_ID_HEADER: &str = "x-ryu-caller-user-id";
pub const CALLER_ORG_ID_HEADER: &str = "x-ryu-caller-org-id";

/// Core strips caller-controlled copies and stamps these values after verifying
/// the user identity. The node id is supplied by this sidecar's own Store.
pub fn tenant_from_headers(
    headers: &HeaderMap,
    node_id: &str,
    managed_node: bool,
) -> Result<TenantContext, StatusCode> {
    let owner_user_id = server_header(headers, CALLER_USER_ID_HEADER)?;
    let org_id = server_header(headers, CALLER_ORG_ID_HEADER)?;
    if org_id.is_some() && owner_user_id.is_none() {
        return Err(StatusCode::FORBIDDEN);
    }
    if owner_user_id.is_none() && managed_node {
        return Err(StatusCode::FORBIDDEN);
    }
    if node_id.trim().is_empty() {
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }
    Ok(TenantContext {
        owner_user_id,
        org_id,
        node_id: node_id.to_owned(),
    })
}

fn server_header(headers: &HeaderMap, name: &str) -> Result<Option<String>, StatusCode> {
    let Some(value) = headers.get(name) else {
        return Ok(None);
    };
    let value = value.to_str().map_err(|_| StatusCode::FORBIDDEN)?.trim();
    if value.is_empty() || value.len() > 256 || value.chars().any(char::is_control) {
        return Err(StatusCode::FORBIDDEN);
    }
    Ok(Some(value.to_owned()))
}

async fn attach_tenant(
    mut request: Request,
    next: Next,
    node_id: &str,
    managed_node: bool,
) -> Response {
    let tenant = match tenant_from_headers(request.headers(), node_id, managed_node) {
        Ok(tenant) => tenant,
        Err(status) => return status.into_response(),
    };
    request.extensions_mut().insert(tenant);
    next.run(request).await
}

pub fn routes(ctx: Arc<Ctx>) -> Router {
    routes_with_authorization(ctx, crate::authorization::AuthorizationClient::from_env())
}

pub fn routes_with_authorization(
    ctx: Arc<Ctx>,
    authorization: Option<crate::authorization::AuthorizationClient>,
) -> Router {
    let node_id = ctx.store.node_id().to_owned();
    let managed_node = paths::is_managed_node();
    Router::new()
        .route("/bootstrap", get(bootstrap))
        .route("/analytics", get(analytics))
        .route("/projects", get(projects).post(create_project))
        .route("/projects/:id", get(project).delete(delete_project))
        .route(
            "/projects/:id/agent-runs",
            get(project_agent_runs).post(save_agent_run),
        )
        .route("/tests/:id", patch(update_test))
        .route("/tests/:id/run", post(run_test))
        .route("/projects/:id/explore", post(explore_project))
        .route("/projects/:id/runs", get(project_runs).post(run_project))
        .route("/runs/:id", get(run))
        .route("/evidence/:id", get(evidence_artifacts))
        .route("/runs/:id/failures/:failure_id/heal", post(heal_failure))
        .route("/tools/run_project", post(tool_run_project))
        .route("/tools/analytics", get(tool_analytics))
        .route("/lists", get(lists).post(create_list))
        .route("/lists/:id", patch(update_list))
        .route("/lists/:id/runs", post(run_list))
        .route("/schedules", get(schedules).post(create_schedule))
        .route(
            "/schedules/:id",
            patch(update_schedule).delete(delete_schedule),
        )
        .route("/schedules/:id/run", post(run_schedule))
        .with_state(ctx)
        .layer(Extension(Arc::new(authorization)))
        .layer(from_fn(move |request: Request, next: Next| {
            let node_id = node_id.clone();
            async move { attach_tenant(request, next, &node_id, managed_node).await }
        }))
}

#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    code: &'static str,
    message: String,
}

impl ApiError {
    fn bad(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            code: "invalid_request",
            message: message.into(),
        }
    }

    fn not_found(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            code: "not_found",
            message: message.into(),
        }
    }

    fn internal(error: impl std::fmt::Display) -> Self {
        tracing::warn!("Checks API error: {error}");
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: "server_error",
            message: "Checks could not complete that request.".to_owned(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(json!({ "error": { "code": self.code, "message": self.message } })),
        )
            .into_response()
    }
}

type ApiResult<T> = Result<Json<T>, ApiError>;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapResponse {
    projects: Vec<Project>,
    tests: Vec<crate::model::TestCase>,
    lists: Vec<TestList>,
    schedules: Vec<Schedule>,
    runs: Vec<RunRecord>,
    explorations: Vec<ExplorationRecord>,
    agent_runs: Vec<AgentRunRecord>,
}

async fn bootstrap(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
) -> ApiResult<BootstrapResponse> {
    let state = ctx.store.snapshot_for(&tenant);
    Ok(Json(BootstrapResponse::from(state)))
}

async fn projects(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
) -> ApiResult<Value> {
    Ok(Json(
        json!({ "projects": ctx.store.snapshot_for(&tenant).projects }),
    ))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateProjectRequest {
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default = "default_project_type")]
    project_type: String,
    url: String,
    #[serde(default)]
    test_names: Vec<String>,
    #[serde(default)]
    runtime_selection: Option<Value>,
    #[serde(default)]
    context_sources: Vec<crate::model::ContextSource>,
}

fn default_project_type() -> String {
    "UI".to_owned()
}

async fn create_project(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
    Json(input): Json<CreateProjectRequest>,
) -> ApiResult<Value> {
    if input.url.trim().is_empty() {
        return Err(ApiError::bad("a target URL is required"));
    }
    let (project, tests) = ctx
        .store
        .create_project_for(
            &tenant,
            input.name,
            input.description,
            input.project_type,
            input.url,
            input.test_names,
            input.runtime_selection,
            input.context_sources,
        )
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "project": project, "tests": tests })))
}

async fn project(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
    Path(id): Path<String>,
) -> ApiResult<Value> {
    let state = ctx.store.snapshot_for(&tenant);
    let project = state
        .projects
        .iter()
        .find(|project| project.id == id)
        .cloned()
        .ok_or_else(|| ApiError::not_found("project not found"))?;
    let tests = state
        .tests
        .into_iter()
        .filter(|test| test.project_id == id)
        .collect::<Vec<_>>();
    let latest_run = project
        .latest_run_id
        .as_deref()
        .and_then(|run_id| state.runs.iter().find(|run| run.id == run_id))
        .cloned();
    let exploration = project
        .latest_exploration_id
        .as_deref()
        .and_then(|exploration_id| {
            state
                .explorations
                .iter()
                .find(|item| item.id == exploration_id)
        })
        .cloned();
    let agent_runs = state
        .agent_runs
        .iter()
        .filter(|run| run.project_id == id)
        .cloned()
        .collect::<Vec<_>>();
    Ok(Json(
        json!({ "project": project, "tests": tests, "latestRun": latest_run, "exploration": exploration, "agentRuns": agent_runs }),
    ))
}

async fn delete_project(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
    Path(id): Path<String>,
) -> ApiResult<Value> {
    ctx.store
        .delete_project_for(&tenant, &id)
        .map_err(|error| {
            if error.to_string().contains("not found") {
                ApiError::not_found(error.to_string())
            } else {
                ApiError::internal(error)
            }
        })?;
    Ok(Json(json!({ "deleted": true })))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateTestRequest {
    name: Option<String>,
    description: Option<String>,
    steps: Option<Vec<String>>,
    assertions: Option<Vec<String>>,
    priority: Option<String>,
    request_method: Option<String>,
    request_path: Option<String>,
    expected_status: Option<u16>,
    response_assertions: Option<Vec<String>>,
    max_response_time_ms: Option<u64>,
}

async fn update_test(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
    Path(id): Path<String>,
    Json(input): Json<UpdateTestRequest>,
) -> ApiResult<crate::model::TestCase> {
    ctx.store
        .update_test_for(
            &tenant,
            &id,
            input.name,
            input.description,
            input.steps,
            input.assertions,
            input.priority,
            input.request_method,
            input.request_path,
            input.expected_status,
            input.response_assertions,
            input.max_response_time_ms,
        )
        .map(Json)
        .map_err(|error| {
            if error.to_string().contains("not found") {
                ApiError::not_found(error.to_string())
            } else {
                ApiError::bad_store(error)
            }
        })
}

async fn run_test(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
    Path(id): Path<String>,
    Json(input): Json<RunRequest>,
) -> ApiResult<RunRecord> {
    // An unknown or another tenant's case is a 404, not an unreachable target.
    if !ctx
        .store
        .snapshot_for(&tenant)
        .tests
        .iter()
        .any(|test| test.id == id)
    {
        return Err(ApiError::not_found("test case not found"));
    }
    crate::service::run_test_for(&ctx.store, &tenant, &id, &input.trigger)
        .await
        .map(Json)
        .map_err(ApiError::bad_runner)
}

async fn project_agent_runs(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
    Path(id): Path<String>,
) -> ApiResult<Value> {
    if ctx.store.get_project_for(&tenant, &id).is_none() {
        return Err(ApiError::not_found("project not found"));
    }
    Ok(Json(json!({
        "agentRuns": ctx.store.snapshot_for(&tenant).agent_runs.into_iter().filter(|run| run.project_id == id).collect::<Vec<_>>()
    })))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveAgentRunRequest {
    agent_id: String,
    #[serde(default)]
    status: String,
    #[serde(default)]
    verdict: String,
    #[serde(default = "default_agent_evidence_level")]
    evidence_level: String,
    transcript: String,
    #[serde(default)]
    artifacts: Vec<AgentArtifact>,
    started_at: Option<chrono::DateTime<Utc>>,
    finished_at: Option<chrono::DateTime<Utc>>,
}

fn default_agent_evidence_level() -> String {
    "agent-transcript".to_owned()
}

async fn save_agent_run(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
    Path(id): Path<String>,
    Json(input): Json<SaveAgentRunRequest>,
) -> ApiResult<AgentRunRecord> {
    let now = Utc::now();
    let run = AgentRunRecord {
        id: format!("agent-run-{}", uuid::Uuid::new_v4().simple()),
        tenant: Default::default(),
        project_id: id,
        agent_id: input.agent_id.trim().to_owned(),
        status: if input.status.trim().is_empty() {
            "completed".to_owned()
        } else {
            input.status
        },
        verdict: if input.verdict.trim().is_empty() {
            "unverified".to_owned()
        } else {
            input.verdict
        },
        evidence_level: input.evidence_level,
        transcript: input.transcript,
        artifacts: input.artifacts,
        started_at: input.started_at.unwrap_or(now),
        finished_at: input.finished_at.unwrap_or(now),
    };
    ctx.store
        .save_agent_run_for(&tenant, run)
        .map(Json)
        .map_err(ApiError::bad_store)
}

async fn explore_project(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
    Path(id): Path<String>,
) -> ApiResult<ExplorationRecord> {
    let project = ctx
        .store
        .get_project_for(&tenant, &id)
        .ok_or_else(|| ApiError::not_found("project not found"))?;
    let exploration = runner::explore(&project)
        .await
        .map_err(ApiError::bad_runner)?;
    ctx.store
        .save_exploration_for(&tenant, exploration.clone())
        .map_err(ApiError::internal)?;
    Ok(Json(exploration))
}

async fn project_runs(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
    Path(id): Path<String>,
) -> ApiResult<Value> {
    if ctx.store.get_project_for(&tenant, &id).is_none() {
        return Err(ApiError::not_found("project not found"));
    }
    let runs = ctx
        .store
        .snapshot_for(&tenant)
        .runs
        .into_iter()
        .filter(|run| run.project_id == id)
        .collect::<Vec<_>>();
    Ok(Json(json!({ "runs": runs })))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunRequest {
    #[serde(default = "default_trigger")]
    trigger: String,
}

fn default_trigger() -> String {
    "manual".to_owned()
}

async fn run_project(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
    Path(id): Path<String>,
    Json(input): Json<RunRequest>,
) -> ApiResult<RunRecord> {
    execute_project(&ctx, &tenant, &id, &input.trigger)
        .await
        .map(Json)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToolRunProjectRequest {
    project_id: String,
    #[serde(default = "default_trigger")]
    trigger: String,
}

async fn tool_run_project(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
    Json(input): Json<ToolRunProjectRequest>,
) -> ApiResult<RunRecord> {
    execute_project(&ctx, &tenant, &input.project_id, &input.trigger)
        .await
        .map(Json)
}

async fn execute_project(
    ctx: &Ctx,
    tenant: &TenantContext,
    id: &str,
    trigger: &str,
) -> Result<RunRecord, ApiError> {
    ctx.store
        .get_project_for(tenant, id)
        .ok_or_else(|| ApiError::not_found("project not found"))?;
    crate::service::run_project_for(&ctx.store, tenant, id, trigger)
        .await
        .map_err(ApiError::bad_runner)
}

async fn heal_failure(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
    Path((id, failure_id)): Path<(String, String)>,
) -> ApiResult<RunRecord> {
    ctx.store
        .heal_failure_for(&tenant, &id, &failure_id)
        .map(Json)
        .map_err(|error| {
            if error.to_string().contains("not found") {
                ApiError::not_found(error.to_string())
            } else {
                ApiError::internal(error)
            }
        })
}

async fn tool_analytics(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
) -> ApiResult<Analytics> {
    Ok(Json(ctx.store.analytics_for(&tenant)))
}

async fn run(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
    Path(id): Path<String>,
) -> ApiResult<RunRecord> {
    ctx.store
        .get_run_for(&tenant, &id)
        .map(Json)
        .ok_or_else(|| ApiError::not_found("run not found"))
}

/// Retained browser artifacts for one evidence record. Served as JSON (base64
/// PNG + DOM snapshot) so the Companion reads it through the same app request
/// bridge as every other route. The record must belong to a run the caller's
/// tenant owns; the files themselves are never addressed by path.
async fn evidence_artifacts(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
    Path(id): Path<String>,
) -> ApiResult<Value> {
    if !crate::evidence::valid_id(&id) {
        return Err(ApiError::not_found("evidence not found"));
    }
    let record = ctx
        .store
        .evidence_for(&tenant, &id)
        .ok_or_else(|| ApiError::not_found("evidence not found"))?;
    let (screenshot, dom) = if record.screenshot_available || record.dom_snapshot_available {
        ctx.store.read_evidence(&id).map_err(ApiError::internal)?
    } else {
        (None, None)
    };
    Ok(Json(json!({
        "id": record.id,
        "level": record.level,
        "screenshot": screenshot.map(|data| json!({ "mime": "image/png", "data": data })),
        "domSnapshot": dom,
    })))
}

async fn lists(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
) -> ApiResult<Value> {
    Ok(Json(
        json!({ "lists": ctx.store.snapshot_for(&tenant).lists }),
    ))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateListRequest {
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateListRequest {
    #[serde(default)]
    project_ids: Vec<String>,
    #[serde(default)]
    test_ids: Option<Vec<String>>,
}

async fn create_list(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
    Json(input): Json<CreateListRequest>,
) -> ApiResult<TestList> {
    if input.name.trim().is_empty() {
        return Err(ApiError::bad("a test list needs a name"));
    }
    ctx.store
        .create_list_for(&tenant, input.name)
        .map(Json)
        .map_err(ApiError::internal)
}

async fn update_list(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
    Path(id): Path<String>,
    Json(input): Json<UpdateListRequest>,
) -> ApiResult<TestList> {
    ctx.store
        .update_list_for(&tenant, &id, input.project_ids, input.test_ids)
        .map(Json)
        .map_err(|error| {
            if error.to_string().contains("not found") {
                ApiError::not_found(error.to_string())
            } else {
                ApiError::bad_store(error)
            }
        })
}

async fn run_list(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
    Path(id): Path<String>,
) -> ApiResult<Value> {
    // An unknown or another tenant's list is a 404, not an unreachable target.
    if !ctx
        .store
        .snapshot_for(&tenant)
        .lists
        .iter()
        .any(|list| list.id == id)
    {
        return Err(ApiError::not_found("test list not found"));
    }
    let runs = crate::service::run_list_for(&ctx.store, &tenant, &id, "list")
        .await
        .map_err(ApiError::bad_runner)?;
    Ok(Json(json!({ "runs": runs })))
}

async fn schedules(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
) -> ApiResult<Value> {
    Ok(Json(
        json!({ "schedules": ctx.store.snapshot_for(&tenant).schedules }),
    ))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateScheduleRequest {
    name: String,
    list_id: String,
    frequency: String,
}

async fn create_schedule(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
    Extension(authorization): Extension<Arc<Option<crate::authorization::AuthorizationClient>>>,
    headers: HeaderMap,
    Json(input): Json<CreateScheduleRequest>,
) -> ApiResult<Schedule> {
    if input.name.trim().is_empty() || input.frequency.trim().is_empty() {
        return Err(ApiError::bad("a schedule needs a name and frequency"));
    }
    let proof = crate::authorization::issue(
        authorization.as_ref().as_ref(),
        &tenant,
        headers
            .get(crate::authorization::PRINCIPAL_HEADER)
            .and_then(|value| value.to_str().ok()),
    )
    .await
    .map_err(|_| ApiError::execution_denied())?;
    ctx.store
        .create_authorized_schedule_for(&tenant, input.name, input.list_id, input.frequency, proof)
        .map(Json)
        .map_err(ApiError::bad_store)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateScheduleRequest {
    active: Option<bool>,
}

async fn update_schedule(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
    Extension(authorization): Extension<Arc<Option<crate::authorization::AuthorizationClient>>>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(input): Json<UpdateScheduleRequest>,
) -> ApiResult<Schedule> {
    let active = input
        .active
        .ok_or_else(|| ApiError::bad("active is required"))?;
    if active {
        let proof = crate::authorization::issue(
            authorization.as_ref().as_ref(),
            &tenant,
            headers
                .get(crate::authorization::PRINCIPAL_HEADER)
                .and_then(|value| value.to_str().ok()),
        )
        .await
        .map_err(|_| ApiError::execution_denied())?;
        if let Some(proof) = proof {
            ctx.store
                .authorize_schedule_for(&tenant, &id, proof)
                .map_err(ApiError::bad_store)?;
        }
    }
    ctx.store
        .set_schedule_active_for(&tenant, &id, active)
        .map(Json)
        .map_err(|error| {
            if error.to_string().contains("not found") {
                ApiError::not_found(error.to_string())
            } else {
                ApiError::internal(error)
            }
        })
}

async fn run_schedule(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
    Path(id): Path<String>,
) -> ApiResult<Value> {
    let schedule = ctx
        .store
        .snapshot_for(&tenant)
        .schedules
        .into_iter()
        .find(|schedule| schedule.id == id)
        .ok_or_else(|| ApiError::not_found("schedule not found"))?;
    let runs =
        crate::service::run_list_for(&ctx.store, &tenant, &schedule.list_id, "schedule-manual")
            .await
            .map_err(ApiError::bad_runner)?;
    let result = if runs.iter().all(|run| run.failed == 0) {
        "passed"
    } else {
        "attention"
    };
    let updated = ctx
        .store
        .record_schedule_run_for(&tenant, &id, result, Utc::now())
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "schedule": updated, "runs": runs })))
}

async fn delete_schedule(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
    Path(id): Path<String>,
) -> ApiResult<Value> {
    ctx.store
        .delete_schedule_for(&tenant, &id)
        .map_err(|error| {
            if error.to_string().contains("not found") {
                ApiError::not_found(error.to_string())
            } else {
                ApiError::internal(error)
            }
        })?;
    Ok(Json(json!({ "deleted": true })))
}

async fn analytics(
    State(ctx): State<Arc<Ctx>>,
    Extension(tenant): Extension<TenantContext>,
) -> ApiResult<Analytics> {
    Ok(Json(ctx.store.analytics_for(&tenant)))
}

impl From<StoreState> for BootstrapResponse {
    fn from(state: StoreState) -> Self {
        Self {
            projects: state.projects,
            tests: state.tests,
            lists: state.lists,
            schedules: state.schedules,
            runs: state.runs,
            explorations: state.explorations,
            agent_runs: state.agent_runs,
        }
    }
}

impl ApiError {
    fn execution_denied() -> Self {
        Self {
            status: StatusCode::FORBIDDEN,
            code: "execution_permission_required",
            message: "Starting recurring checks requires current permission to run live checks."
                .to_owned(),
        }
    }
    fn bad_runner(error: anyhow::Error) -> Self {
        Self {
            status: StatusCode::BAD_GATEWAY,
            code: "target_unavailable",
            message: error.to_string(),
        }
    }

    fn bad_store(error: anyhow::Error) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            code: "invalid_request",
            message: error.to_string(),
        }
    }
}

#[cfg(test)]
#[path = "api_run_tests.rs"]
mod run_tests;
