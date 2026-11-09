use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use anyhow::{Context, Result};
use chrono::{DateTime, Duration, Utc};
use serde_json::Value;
use uuid::Uuid;

use crate::model::{
    AgentRunRecord, Analytics, ContextSource, ExplorationRecord, FailureBucket, Project, RunRecord,
    Schedule, StoreState, TenantContext, TenantScope, TestCase, TestList, SCHEMA_VERSION,
};
use crate::paths;
use crate::seal_keys::{PluginKeys, StoreSeal};

/// The registered content-store name of `checks.json` (never rename).
pub const STATE_STORE: &str = "checks.json";
/// Records the key check value of the key that sealed this store.
pub const SEAL_RECORD_FILE: &str = "checks.seal.json";
/// This app's canonical plugin id (the sealing key's scope).
pub const PLUGIN_ID: &str = "@ryu/checks";

/// The AAD of the whole `checks.json` body.
fn state_ctx() -> ryu_crypto::ContentContext {
    ryu_crypto::ContentContext::for_id("snapshot", STATE_FILE_ID)
}
const STATE_FILE_ID: &str = "checks.json";

#[derive(Clone)]
pub struct Store {
    path: PathBuf,
    node_id: String,
    state: Arc<RwLock<StoreState>>,
    seal: StoreSeal,
    evidence_seal: StoreSeal,
}

fn read_seal_record(path: &Path) -> Result<Option<String>> {
    match fs::read(path) {
        Ok(bytes) => {
            let value: Value = serde_json::from_slice(&bytes)
                .with_context(|| format!("parse {}", path.display()))?;
            match value.get("kcv").and_then(Value::as_str) {
                Some(kcv) if !kcv.is_empty() => Ok(Some(kcv.to_owned())),
                _ => anyhow::bail!("{} is malformed", path.display()),
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

impl Store {
    /// Open the store, resolving this process's sealing key with the store's
    /// directory as the plugin data dir (see [`crate::seal_keys`]).
    pub fn open(path: impl Into<PathBuf>) -> Result<Self> {
        let path = path.into();
        let dir = path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .to_path_buf();
        let keys = PluginKeys::resolve(PLUGIN_ID, &dir)?;
        Self::open_with_keys(path, &keys)
    }

    /// [`Self::open`] with explicit keys.
    ///
    /// At rest, `checks.json` is one `encb:v1:` envelope (store `checks.json`)
    /// and evidence files are `RYU-SF01` (store `checks-evidence`). A legacy
    /// plaintext `checks.json` is rewritten sealed on open (temp + rename);
    /// legacy evidence files are sealed in place by
    /// [`Self::seal_legacy_evidence_in_background`] (the sidecar calls it).
    pub fn open_with_keys(path: impl Into<PathBuf>, keys: &PluginKeys) -> Result<Self> {
        let path = path.into();
        let dir = path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .to_path_buf();
        fs::create_dir_all(&dir)
            .with_context(|| format!("create Checks data directory {}", dir.display()))?;
        let record_path = dir.join(SEAL_RECORD_FILE);
        let recorded = read_seal_record(&record_path)?;
        let raw = match fs::read(&path) {
            Ok(bytes) => Some(bytes),
            Err(error) if error.kind() == io::ErrorKind::NotFound => None,
            Err(error) => {
                return Err(error).with_context(|| format!("read Checks state {}", path.display()))
            }
        };
        let state_sealed = raw
            .as_deref()
            .is_some_and(|bytes| bytes.starts_with(b"encb:"));
        let evidence_dir = dir.join(crate::evidence::EVIDENCE_DIR_NAME);
        let holds_sealed = state_sealed || crate::evidence::any_sealed(&evidence_dir);
        let seal = keys.store_state(STATE_STORE, recorded.as_deref(), holds_sealed);
        let evidence_seal =
            keys.store_state(crate::evidence::STORE, recorded.as_deref(), holds_sealed);

        let json = match raw {
            Some(bytes) if state_sealed => match &seal {
                StoreSeal::Sealing(_) => Some(
                    seal.open_text(&String::from_utf8_lossy(&bytes), &state_ctx())
                        .with_context(|| format!("open Checks state {}", path.display()))?
                        .into_bytes(),
                ),
                // Sealed and no usable key: serve nothing, refuse writes, keep the file.
                _ => {
                    tracing::error!(
                        "checks: the state file is sealed and this process cannot open it ({})",
                        seal.label()
                    );
                    None
                }
            },
            other => other,
        };
        let state = if let Some(json) = json {
            let mut state: StoreState = serde_json::from_slice(&json)
                .with_context(|| format!("parse Checks state {}", path.display()))?;
            if state.schema_version > SCHEMA_VERSION {
                anyhow::bail!(
                    "Checks state schema {} is newer than this sidecar supports ({SCHEMA_VERSION})",
                    state.schema_version
                );
            }
            state.schema_version = SCHEMA_VERSION;
            state
        } else {
            StoreState::default()
        };

        let node_id = paths::node_id_for_state_path(&path);
        let store = Self {
            path,
            node_id,
            state: Arc::new(RwLock::new(state)),
            seal,
            evidence_seal,
        };
        if let StoreSeal::Sealing(cipher) = &store.seal {
            if recorded.is_none() {
                let body = serde_json::json!({ "v": 1, "kcv": cipher.kcv() });
                crate::seal_keys::write_private_file(&record_path, format!("{body}\n").as_bytes())?;
            }
            if !state_sealed && store.path.exists() {
                // Seal the legacy plaintext state: the sealed copy replaces it
                // by rename, never before it is fully written.
                store.persist()?;
                tracing::info!("checks: sealed the legacy plaintext state file");
            }
        }
        if !store.path.exists() && store.seal.ensure_writable().is_ok() {
            store.persist()?;
        }
        Ok(store)
    }

    /// Seal legacy plaintext evidence files on a background thread. Only the
    /// sidecar calls this: the MCP and CLI modes share the directory and must
    /// not race it.
    pub fn seal_legacy_evidence_in_background(&self) {
        if !self.evidence_seal.is_sealing() {
            return;
        }
        let (dir, seal) = (self.evidence_dir(), self.evidence_seal.clone());
        std::thread::spawn(move || {
            let (sealed, failed) = crate::evidence::seal_legacy_files(&dir, &seal);
            if sealed + failed > 0 {
                tracing::info!(sealed, failed, "checks: sealed legacy evidence files");
            }
        });
    }

    /// The sealing health item: `{state, detail?}`.
    pub fn seal_health(&self) -> Value {
        self.seal.health()
    }

    /// Read one evidence id's retained files (see [`crate::evidence::read`]).
    pub fn read_evidence(&self, id: &str) -> Result<(Option<String>, Option<Value>)> {
        crate::evidence::read(&self.evidence_dir(), &self.evidence_seal, id)
    }

    pub fn snapshot(&self) -> StoreState {
        self.state
            .read()
            .expect("Checks store read lock poisoned")
            .clone()
    }

    pub fn node_id(&self) -> &str {
        &self.node_id
    }

    /// Directory for retained screenshots and DOM snapshots, beside the store.
    pub fn evidence_dir(&self) -> PathBuf {
        self.path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join(crate::evidence::EVIDENCE_DIR_NAME)
    }

    /// Browser evidence wiring for runs saved into this store: the
    /// `browser.control` broker Core injected (if any) and this store's directory.
    pub fn evidence_env(&self) -> crate::evidence::EvidenceEnv {
        crate::evidence::EvidenceEnv::from_env(self.evidence_dir(), self.evidence_seal.clone())
    }

    /// One evidence record, only when its run belongs to `context`.
    pub fn evidence_for(
        &self,
        context: &TenantContext,
        evidence_id: &str,
    ) -> Option<crate::model::EvidenceRecord> {
        self.snapshot_for(context)
            .runs
            .into_iter()
            .flat_map(|run| run.evidence)
            .find(|item| item.id == evidence_id)
    }

    pub fn snapshot_for(&self, context: &TenantContext) -> StoreState {
        let state = self.snapshot();
        if context.node_id != self.node_id {
            return StoreState {
                schema_version: state.schema_version,
                ..StoreState::default()
            };
        }

        StoreState {
            schema_version: state.schema_version,
            projects: state
                .projects
                .into_iter()
                .filter(|project| project.tenant.matches(context))
                .collect(),
            tests: state
                .tests
                .into_iter()
                .filter(|test| test.tenant.matches(context))
                .collect(),
            lists: state
                .lists
                .into_iter()
                .filter(|list| list.tenant.matches(context))
                .collect(),
            schedules: state
                .schedules
                .into_iter()
                .filter(|schedule| schedule.tenant.matches(context))
                .collect(),
            runs: state
                .runs
                .into_iter()
                .filter(|run| run.tenant.matches(context))
                .collect(),
            explorations: state
                .explorations
                .into_iter()
                .filter(|exploration| exploration.tenant.matches(context))
                .collect(),
            agent_runs: state
                .agent_runs
                .into_iter()
                .filter(|run| run.tenant.matches(context))
                .collect(),
        }
    }

    fn tenant_scope(&self, context: &TenantContext) -> Result<TenantScope> {
        if context.node_id != self.node_id {
            anyhow::bail!("tenant node does not match the Checks store node");
        }
        Ok(TenantScope::from_context(context))
    }

    pub fn replace_state(&self, mut state: StoreState) -> Result<()> {
        state.schema_version = SCHEMA_VERSION;
        let mut current = self.write_state();
        *current = state.clone();
        self.persist_state(&state)
    }

    pub fn delete_project_for(&self, context: &TenantContext, project_id: &str) -> Result<()> {
        self.tenant_scope(context)?;
        let mut state = self.write_state();
        if !state
            .projects
            .iter()
            .any(|project| project.id == project_id && project.tenant.matches(context))
        {
            anyhow::bail!("project not found");
        }
        let removed_evidence = state
            .runs
            .iter()
            .filter(|run| run.project_id == project_id)
            .flat_map(|run| run.evidence.iter().map(|item| item.id.clone()))
            .collect::<Vec<_>>();
        state.projects.retain(|project| project.id != project_id);
        state.tests.retain(|test| test.project_id != project_id);
        state.runs.retain(|run| run.project_id != project_id);
        state
            .explorations
            .retain(|exploration| exploration.project_id != project_id);
        state.agent_runs.retain(|run| run.project_id != project_id);
        for list in state
            .lists
            .iter_mut()
            .filter(|list| list.tenant.matches(context))
        {
            list.project_ids.retain(|id| id != project_id);
        }
        self.persist_state(&state)?;
        crate::evidence::remove(&self.evidence_dir(), removed_evidence);
        Ok(())
    }

    pub fn get_project(&self, id: &str) -> Option<Project> {
        self.snapshot()
            .projects
            .into_iter()
            .find(|project| project.id == id)
    }

    pub fn get_project_for(&self, context: &TenantContext, id: &str) -> Option<Project> {
        (context.node_id == self.node_id).then(|| {
            self.snapshot()
                .projects
                .into_iter()
                .find(|project| project.id == id && project.tenant.matches(context))
        })?
    }

    pub fn tests_for_project(&self, project_id: &str) -> Vec<TestCase> {
        self.snapshot()
            .tests
            .into_iter()
            .filter(|test| test.project_id == project_id)
            .collect()
    }

    pub fn tests_for_project_for(
        &self,
        context: &TenantContext,
        project_id: &str,
    ) -> Vec<TestCase> {
        if context.node_id != self.node_id {
            return Vec::new();
        }
        self.snapshot()
            .tests
            .into_iter()
            .filter(|test| test.project_id == project_id && test.tenant.matches(context))
            .collect()
    }

    #[allow(clippy::too_many_arguments)]
    pub fn update_test(
        &self,
        test_id: &str,
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
    ) -> Result<TestCase> {
        let mut state = self.write_state();
        let test = state
            .tests
            .iter_mut()
            .find(|test| test.id == test_id)
            .context("test case not found")?;
        if let Some(name) = name {
            let name = name.trim();
            if name.is_empty() {
                anyhow::bail!("test case name cannot be empty");
            }
            test.name = name.to_owned();
        }
        if let Some(description) = description {
            test.description = description.trim().to_owned();
        }
        if let Some(steps) = steps {
            test.steps = normalize_lines(steps);
        }
        if let Some(assertions) = assertions {
            test.assertions = normalize_lines(assertions);
        }
        if let Some(priority) = priority {
            test.priority = match priority.trim().to_ascii_lowercase().as_str() {
                "low" => "Low".to_owned(),
                "medium" => "Medium".to_owned(),
                _ => "High".to_owned(),
            };
        }
        if let Some(request_method) = request_method {
            test.request_method = normalize_request_method(&request_method);
        }
        if let Some(request_path) = request_path {
            test.request_path =
                (!request_path.trim().is_empty()).then(|| request_path.trim().to_owned());
        }
        if let Some(expected_status) = expected_status {
            if !(100..=599).contains(&expected_status) {
                anyhow::bail!("expected status must be between 100 and 599");
            }
            test.expected_status = expected_status;
        }
        if let Some(response_assertions) = response_assertions {
            test.response_assertions = normalize_lines(response_assertions);
        }
        if let Some(max_response_time_ms) = max_response_time_ms {
            test.max_response_time_ms = (max_response_time_ms > 0).then_some(max_response_time_ms);
        }
        test.updated = "Just now".to_owned();
        let updated = test.clone();
        self.persist_state(&state)?;
        Ok(updated)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn update_test_for(
        &self,
        context: &TenantContext,
        test_id: &str,
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
    ) -> Result<TestCase> {
        self.tenant_scope(context)?;
        if !self
            .snapshot()
            .tests
            .iter()
            .any(|test| test.id == test_id && test.tenant.matches(context))
        {
            anyhow::bail!("test case not found");
        }
        self.update_test(
            test_id,
            name,
            description,
            steps,
            assertions,
            priority,
            request_method,
            request_path,
            expected_status,
            response_assertions,
            max_response_time_ms,
        )
    }

    pub fn get_run(&self, id: &str) -> Option<RunRecord> {
        self.snapshot().runs.into_iter().find(|run| run.id == id)
    }

    pub fn get_run_for(&self, context: &TenantContext, id: &str) -> Option<RunRecord> {
        (context.node_id == self.node_id).then(|| {
            self.snapshot()
                .runs
                .into_iter()
                .find(|run| run.id == id && run.tenant.matches(context))
        })?
    }

    pub fn get_exploration(&self, id: &str) -> Option<ExplorationRecord> {
        self.snapshot()
            .explorations
            .into_iter()
            .find(|exploration| exploration.id == id)
    }

    pub fn get_exploration_for(
        &self,
        context: &TenantContext,
        id: &str,
    ) -> Option<ExplorationRecord> {
        (context.node_id == self.node_id).then(|| {
            self.snapshot()
                .explorations
                .into_iter()
                .find(|exploration| exploration.id == id && exploration.tenant.matches(context))
        })?
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_project(
        &self,
        name: String,
        description: String,
        project_type: String,
        url: String,
        test_names: Vec<String>,
        runtime_selection: Option<Value>,
        context_sources: Vec<ContextSource>,
    ) -> Result<(Project, Vec<TestCase>)> {
        self.create_project_for(
            &TenantContext::local(self.node_id()),
            name,
            description,
            project_type,
            url,
            test_names,
            runtime_selection,
            context_sources,
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_project_for(
        &self,
        context: &TenantContext,
        name: String,
        description: String,
        project_type: String,
        url: String,
        test_names: Vec<String>,
        runtime_selection: Option<Value>,
        context_sources: Vec<ContextSource>,
    ) -> Result<(Project, Vec<TestCase>)> {
        self.tenant_scope(context)?;
        self.create_project_with_scope(
            context,
            name,
            description,
            project_type,
            url,
            test_names,
            runtime_selection,
            context_sources,
        )
    }

    #[allow(clippy::too_many_arguments)]
    fn create_project_with_scope(
        &self,
        context: &TenantContext,
        name: String,
        description: String,
        project_type: String,
        url: String,
        test_names: Vec<String>,
        runtime_selection: Option<Value>,
        context_sources: Vec<ContextSource>,
    ) -> Result<(Project, Vec<TestCase>)> {
        let tenant = TenantScope::from_context(context);
        let now = Utc::now();
        let project_id = format!("project-{}", short_id());
        let normalized_type = normalize_project_type(&project_type);
        let names = if test_names.is_empty() {
            vec!["Target responds successfully".to_owned()]
        } else {
            test_names
        };
        let project_name = if name.trim().is_empty() {
            "Untitled verification project".to_owned()
        } else {
            name.trim().to_owned()
        };
        let project = Project {
            id: project_id.clone(),
            tenant,
            name: project_name.clone(),
            description: if description.trim().is_empty() {
                "A node-local verification project.".to_owned()
            } else {
                description.trim().to_owned()
            },
            project_type: normalized_type.clone(),
            url: url.trim().to_owned(),
            tests: names.len(),
            passed: 0,
            attention: 0,
            coverage: 0,
            status: "idle".to_owned(),
            last_run: "Not run".to_owned(),
            next_run: "Not scheduled".to_owned(),
            runtime_selection,
            context_sources,
            latest_run_id: None,
            latest_exploration_id: None,
            created_at: now,
            updated_at: now,
        };
        let tests = names
            .into_iter()
            .enumerate()
            .map(|(index, test_name)| make_test(&project, test_name, index))
            .collect::<Vec<_>>();

        let mut state = self.write_state();
        state.projects.insert(0, project.clone());
        state.tests.splice(0..0, tests.clone());
        self.persist_state(&state)?;
        Ok((project, tests))
    }

    pub fn create_list(&self, name: String) -> Result<TestList> {
        self.create_list_for(&TenantContext::local(self.node_id()), name)
    }

    pub fn create_list_for(&self, context: &TenantContext, name: String) -> Result<TestList> {
        let tenant = self.tenant_scope(context)?;
        let state_snapshot = self.snapshot_for(context);
        let project_ids = state_snapshot
            .projects
            .iter()
            .map(|project| project.id.clone())
            .collect::<Vec<_>>();
        let test_ids = state_snapshot
            .tests
            .iter()
            .map(|test| test.id.clone())
            .collect::<Vec<_>>();
        let (ui_tests, api_tests) = list_test_counts(&state_snapshot.tests, &project_ids);
        let list = TestList {
            id: format!("list-{}", short_id()),
            tenant,
            name: name.trim().to_owned(),
            description: "A local verification collection.".to_owned(),
            status: "idle".to_owned(),
            ui_tests,
            api_tests,
            last_run: "Not run".to_owned(),
            next_run: "Not scheduled".to_owned(),
            project_ids,
            test_ids,
        };
        let mut state = self.write_state();
        state.lists.insert(0, list.clone());
        self.persist_state(&state)?;
        Ok(list)
    }

    pub fn update_list(
        &self,
        list_id: &str,
        project_ids: Vec<String>,
        requested_test_ids: Option<Vec<String>>,
    ) -> Result<TestList> {
        let mut state = self.write_state();
        let available = state
            .projects
            .iter()
            .map(|project| project.id.clone())
            .collect::<std::collections::HashSet<_>>();
        let project_ids = project_ids
            .into_iter()
            .filter(|project_id| available.contains(project_id))
            .collect::<Vec<_>>();
        let available_tests = state
            .tests
            .iter()
            .map(|test| test.id.clone())
            .collect::<std::collections::HashSet<_>>();
        let requested_test_ids = requested_test_ids.map(|test_ids| {
            test_ids
                .into_iter()
                .filter(|test_id| available_tests.contains(test_id))
                .collect::<Vec<_>>()
        });
        let existing_test_ids = state
            .lists
            .iter()
            .find(|list| list.id == list_id)
            .context("test list not found")?
            .test_ids
            .clone();
        let effective_test_ids = requested_test_ids.unwrap_or(existing_test_ids);
        let (ui_tests, api_tests) = if effective_test_ids.is_empty() {
            list_test_counts(&state.tests, &project_ids)
        } else {
            list_test_counts_by_ids(&state.tests, &effective_test_ids)
        };
        let list = state
            .lists
            .iter_mut()
            .find(|list| list.id == list_id)
            .context("test list not found")?;
        list.project_ids = project_ids;
        list.test_ids = effective_test_ids;
        list.ui_tests = ui_tests;
        list.api_tests = api_tests;
        let updated = list.clone();
        self.persist_state(&state)?;
        Ok(updated)
    }

    pub fn update_list_for(
        &self,
        context: &TenantContext,
        list_id: &str,
        project_ids: Vec<String>,
        requested_test_ids: Option<Vec<String>>,
    ) -> Result<TestList> {
        self.tenant_scope(context)?;
        let state = self.snapshot_for(context);
        if !state.lists.iter().any(|list| list.id == list_id) {
            anyhow::bail!("test list not found");
        }
        if project_ids.iter().any(|project_id| {
            !state
                .projects
                .iter()
                .any(|project| &project.id == project_id)
        }) || requested_test_ids.as_ref().is_some_and(|test_ids| {
            test_ids
                .iter()
                .any(|test_id| !state.tests.iter().any(|test| &test.id == test_id))
        }) {
            anyhow::bail!("test list contains records outside the caller tenant");
        }
        self.update_list(list_id, project_ids, requested_test_ids)
    }

    pub fn save_agent_run(&self, run: AgentRunRecord) -> Result<AgentRunRecord> {
        let mut state = self.write_state();
        let project_tenant = state
            .projects
            .iter()
            .find(|project| project.id == run.project_id)
            .map(|project| project.tenant.clone())
            .ok_or_else(|| anyhow::anyhow!("project not found while saving agent run"))?;
        let mut run = run;
        if run.tenant.node_id.is_none() {
            run.tenant = project_tenant;
        }
        run.transcript = run.transcript.chars().take(16_000).collect();
        state.agent_runs.insert(0, run.clone());
        self.persist_state(&state)?;
        Ok(run)
    }

    pub fn save_agent_run_for(
        &self,
        context: &TenantContext,
        mut run: AgentRunRecord,
    ) -> Result<AgentRunRecord> {
        self.tenant_scope(context)?;
        let project = self
            .get_project_for(context, &run.project_id)
            .ok_or_else(|| anyhow::anyhow!("project not found while saving agent run"))?;
        run.tenant = project.tenant;
        self.save_agent_run(run)
    }

    pub fn create_schedule(
        &self,
        name: String,
        list_id: String,
        frequency: String,
    ) -> Result<Schedule> {
        self.create_schedule_for(
            &TenantContext::local(self.node_id()),
            name,
            list_id,
            frequency,
        )
    }

    pub fn create_schedule_for(
        &self,
        context: &TenantContext,
        name: String,
        list_id: String,
        frequency: String,
    ) -> Result<Schedule> {
        self.create_authorized_schedule_for(context, name, list_id, frequency, None)
    }

    pub fn create_authorized_schedule_for(
        &self,
        context: &TenantContext,
        name: String,
        list_id: String,
        frequency: String,
        execution_authorization: Option<String>,
    ) -> Result<Schedule> {
        let tenant = self.tenant_scope(context)?;
        let state_snapshot = self.snapshot_for(context);
        let list = state_snapshot
            .lists
            .iter()
            .find(|list| list.id == list_id)
            .context("test list not found")?;
        let now = Utc::now();
        let next_run_at = schedule_next_at(&frequency, now);
        let schedule = Schedule {
            id: format!("schedule-{}", short_id()),
            tenant,
            name: name.trim().to_owned(),
            list_name: list.name.clone(),
            frequency: frequency.trim().to_owned(),
            next_run: format_schedule_time(next_run_at),
            last_result: "idle".to_owned(),
            active: true,
            list_id,
            next_run_at: Some(next_run_at),
            last_run_at: None,
            created_at: now,
            execution_authorization,
        };
        let mut state = self.write_state();
        state.schedules.insert(0, schedule.clone());
        self.persist_state(&state)?;
        Ok(schedule)
    }

    pub fn due_schedules(&self, now: DateTime<Utc>) -> Vec<Schedule> {
        self.snapshot()
            .schedules
            .into_iter()
            .filter(|schedule| {
                schedule.active
                    && schedule
                        .next_run_at
                        .is_some_and(|next_run_at| next_run_at <= now)
            })
            .collect()
    }

    pub fn record_schedule_run(
        &self,
        schedule_id: &str,
        result: &str,
        now: DateTime<Utc>,
    ) -> Result<Schedule> {
        let mut state = self.write_state();
        let schedule = state
            .schedules
            .iter_mut()
            .find(|schedule| schedule.id == schedule_id)
            .context("schedule not found")?;
        let next_run_at = schedule_next_at(&schedule.frequency, now);
        schedule.last_result = result.to_owned();
        schedule.last_run_at = Some(now);
        schedule.next_run_at = Some(next_run_at);
        schedule.next_run = format_schedule_time(next_run_at);
        let updated = schedule.clone();
        self.persist_state(&state)?;
        Ok(updated)
    }

    pub fn record_schedule_run_for(
        &self,
        context: &TenantContext,
        schedule_id: &str,
        result: &str,
        now: DateTime<Utc>,
    ) -> Result<Schedule> {
        self.tenant_scope(context)?;
        if !self
            .snapshot()
            .schedules
            .iter()
            .any(|schedule| schedule.id == schedule_id && schedule.tenant.matches(context))
        {
            anyhow::bail!("schedule not found");
        }
        self.record_schedule_run(schedule_id, result, now)
    }

    pub fn set_schedule_active(&self, schedule_id: &str, active: bool) -> Result<Schedule> {
        let mut state = self.write_state();
        let schedule = state
            .schedules
            .iter_mut()
            .find(|schedule| schedule.id == schedule_id)
            .context("schedule not found")?;
        schedule.active = active;
        if active {
            let now = Utc::now();
            let next_run_at = schedule_next_at(&schedule.frequency, now);
            schedule.next_run_at = Some(next_run_at);
            schedule.next_run = format_schedule_time(next_run_at);
        }
        let updated = schedule.clone();
        self.persist_state(&state)?;
        Ok(updated)
    }

    pub fn set_schedule_active_for(
        &self,
        context: &TenantContext,
        schedule_id: &str,
        active: bool,
    ) -> Result<Schedule> {
        self.tenant_scope(context)?;
        if !self
            .snapshot()
            .schedules
            .iter()
            .any(|schedule| schedule.id == schedule_id && schedule.tenant.matches(context))
        {
            anyhow::bail!("schedule not found");
        }
        self.set_schedule_active(schedule_id, active)
    }

    pub fn authorize_schedule_for(
        &self,
        context: &TenantContext,
        schedule_id: &str,
        proof: String,
    ) -> Result<()> {
        self.tenant_scope(context)?;
        let mut state = self.write_state();
        let schedule = state
            .schedules
            .iter_mut()
            .find(|schedule| schedule.id == schedule_id && schedule.tenant.matches(context))
            .context("schedule not found")?;
        schedule.execution_authorization = Some(proof);
        self.persist_state(&state)
    }

    pub fn delete_schedule_for(&self, context: &TenantContext, schedule_id: &str) -> Result<()> {
        self.tenant_scope(context)?;
        let mut state = self.write_state();
        let before = state.schedules.len();
        state
            .schedules
            .retain(|schedule| !(schedule.id == schedule_id && schedule.tenant.matches(context)));
        if state.schedules.len() == before {
            anyhow::bail!("schedule not found");
        }
        self.persist_state(&state)
    }

    pub fn save_exploration(&self, exploration: ExplorationRecord) -> Result<()> {
        let mut state = self.write_state();
        let project_tenant = state
            .projects
            .iter_mut()
            .find(|project| project.id == exploration.project_id)
            .map(|project| {
                project.latest_exploration_id = Some(exploration.id.clone());
                project.updated_at = Utc::now();
                project.tenant.clone()
            })
            .context("project not found while saving exploration")?;
        let mut exploration = exploration;
        exploration.tenant = project_tenant;
        state.explorations.insert(0, exploration);
        self.persist_state(&state)
    }

    pub fn save_exploration_for(
        &self,
        context: &TenantContext,
        mut exploration: ExplorationRecord,
    ) -> Result<()> {
        self.tenant_scope(context)?;
        let project = self
            .get_project_for(context, &exploration.project_id)
            .ok_or_else(|| anyhow::anyhow!("project not found while saving exploration"))?;
        exploration.tenant = project.tenant;
        self.save_exploration(exploration)
    }

    pub fn save_run(&self, run: RunRecord) -> Result<()> {
        let mut state = self.write_state();
        let project_id = run.project_id.clone();
        let Some(project) = state
            .projects
            .iter_mut()
            .find(|project| project.id == project_id)
        else {
            // The project was deleted while the run was in flight; nothing will
            // ever reference this run's browser files.
            self.discard_run_evidence(&run);
            anyhow::bail!("project not found while saving run");
        };
        let project_tenant = project.tenant.clone();
        let mut run = run;
        run.tenant = project_tenant;
        if run.scope == "test" {
            project.last_run = "Just now".to_owned();
            project.latest_run_id = Some(run.id.clone());
        } else {
            project.passed = run.passed;
            project.attention = run.failed;
            project.coverage = run.coverage;
            project.status = if run.failed == 0 {
                "passed"
            } else {
                "attention"
            }
            .to_owned();
            project.last_run = "Just now".to_owned();
            project.latest_run_id = Some(run.id.clone());
        }
        project.updated_at = Utc::now();
        for test in state.tests.iter_mut().filter(|test| {
            test.project_id == project_id
                && (run.scope != "test" || run.target_test_id.as_deref() == Some(test.id.as_str()))
        }) {
            if let Some(evidence) = run.evidence.iter().find(|item| item.test_id == test.id) {
                test.status = if run
                    .failures
                    .iter()
                    .any(|failure| failure.test_id == test.id)
                {
                    "attention".to_owned()
                } else {
                    "passed".to_owned()
                };
                test.latest_run_id = Some(run.id.clone());
                test.updated = evidence
                    .observed_at
                    .format("%Y-%m-%d %H:%M UTC")
                    .to_string();
            }
        }
        state.runs.insert(0, run);
        let pruned = prune_evidence(
            &mut state.runs,
            &self.evidence_dir(),
            crate::evidence::MAX_RETAINED_EVIDENCE_RUNS,
            crate::evidence::MAX_RETAINED_EVIDENCE_BYTES,
        );
        self.persist_state(&state)?;
        let evidence_dir = self.evidence_dir();
        crate::evidence::remove(&evidence_dir, pruned);
        let referenced = state
            .runs
            .iter()
            .flat_map(|run| run.evidence.iter().map(|item| item.id.as_str()))
            .collect::<std::collections::HashSet<_>>();
        crate::evidence::sweep_unreferenced(
            &evidence_dir,
            &referenced,
            crate::evidence::UNREFERENCED_EVIDENCE_GRACE,
        );
        Ok(())
    }

    pub fn save_run_for(&self, context: &TenantContext, mut run: RunRecord) -> Result<()> {
        let project = self.tenant_scope(context).and_then(|_| {
            self.get_project_for(context, &run.project_id)
                .ok_or_else(|| anyhow::anyhow!("project not found while saving run"))
        });
        let project = match project {
            Ok(project) => project,
            Err(error) => {
                self.discard_run_evidence(&run);
                return Err(error);
            }
        };
        run.tenant = project.tenant;
        self.save_run(run)
    }

    /// Delete the browser files of a run that will not be stored.
    fn discard_run_evidence(&self, run: &RunRecord) {
        crate::evidence::remove(
            &self.evidence_dir(),
            run.evidence.iter().map(|item| item.id.clone()),
        );
    }

    pub fn heal_failure(&self, run_id: &str, failure_id: &str) -> Result<RunRecord> {
        let mut state = self.write_state();
        let failure_test_id = {
            let run = state
                .runs
                .iter_mut()
                .find(|run| run.id == run_id)
                .context("run not found")?;
            let failure = run
                .failures
                .iter_mut()
                .find(|failure| failure.id == failure_id)
                .context("failure bundle not found")?;
            if failure.status == "healed" {
                return Ok(run.clone());
            }
            failure.status = "healed".to_owned();
            failure.healed_at = Some(Utc::now());
            failure.healing_note = Some(
                "Ryu added a live-observation checkpoint to this plan. Rerun it to confirm the product signal before treating the failure as resolved.".to_owned(),
            );
            failure.test_id.clone()
        };
        if let Some(test) = state
            .tests
            .iter_mut()
            .find(|test| test.id == failure_test_id)
        {
            let step = "Capture the live observation as the updated baseline".to_owned();
            if !test.steps.iter().any(|existing| existing == &step) {
                test.steps.push(step);
            }
            if !test
                .source
                .contains("// Ryu auto-healed the observed journey")
            {
                test.source = format!(
                    "{}\n// Ryu auto-healed the observed journey; rerun to confirm the updated signal.",
                    test.source
                );
            }
            test.status = "idle".to_owned();
            test.latest_run_id = None;
            test.updated = "Just now".to_owned();
        }
        let updated = state
            .runs
            .iter()
            .find(|run| run.id == run_id)
            .cloned()
            .context("run disappeared while healing failure")?;
        self.persist_state(&state)?;
        Ok(updated)
    }

    pub fn heal_failure_for(
        &self,
        context: &TenantContext,
        run_id: &str,
        failure_id: &str,
    ) -> Result<RunRecord> {
        self.tenant_scope(context)?;
        if !self
            .snapshot()
            .runs
            .iter()
            .any(|run| run.id == run_id && run.tenant.matches(context))
        {
            anyhow::bail!("run not found");
        }
        self.heal_failure(run_id, failure_id)
    }

    pub fn analytics(&self) -> Analytics {
        Self::analytics_from_state(self.snapshot())
    }

    pub fn analytics_for(&self, context: &TenantContext) -> Analytics {
        Self::analytics_from_state(self.snapshot_for(context))
    }

    fn analytics_from_state(state: StoreState) -> Analytics {
        let passed = state.runs.iter().map(|run| run.passed).sum::<usize>();
        let failed = state.runs.iter().map(|run| run.failed).sum::<usize>();
        let coverage = if passed + failed == 0 {
            0
        } else {
            (passed * 100)
                .checked_div(passed + failed)
                .unwrap_or_default() as u8
        };
        let mut bucket_counts = std::collections::BTreeMap::<String, usize>::new();
        for failure in state.runs.iter().flat_map(|run| &run.failures) {
            *bucket_counts.entry(failure.root_cause.clone()).or_default() += 1;
        }
        Analytics {
            projects: state.projects.len(),
            tests: state.tests.len(),
            runs: state.runs.len(),
            passed,
            failed,
            coverage,
            failure_buckets: bucket_counts
                .into_iter()
                .map(|(name, count)| FailureBucket { name, count })
                .collect(),
        }
    }

    fn write_state(&self) -> std::sync::RwLockWriteGuard<'_, StoreState> {
        self.state
            .write()
            .expect("Checks store write lock poisoned")
    }

    /// Whether the store now records a sealing key or holds a sealed state
    /// file (checked before a compat-mode write).
    fn sealed_since_open(&self) -> bool {
        let dir = self.path.parent().unwrap_or_else(|| Path::new("."));
        if dir.join(SEAL_RECORD_FILE).exists() {
            return true;
        }
        let mut prefix = [0u8; 5];
        fs::File::open(&self.path)
            .and_then(|mut file| io::Read::read_exact(&mut file, &mut prefix))
            .is_ok_and(|()| &prefix == b"encb:")
    }

    fn persist(&self) -> Result<()> {
        let state = self.snapshot();
        self.persist_state(&state)
    }

    fn persist_state(&self, state: &StoreState) -> Result<()> {
        let json = serde_json::to_string_pretty(state).context("serialize Checks state")?;
        if matches!(self.seal, StoreSeal::Compat) && self.sealed_since_open() {
            // Another process (the sidecar) sealed the store after this one
            // opened it without a key: never write plaintext over it.
            anyhow::bail!(
                "{STATE_STORE} was sealed by the Tests sidecar after this process opened it; \
                 writes from here are refused"
            );
        }
        let body = self.seal.seal_text(&json, &state_ctx())?;
        crate::seal_keys::write_private_file(&self.path, body.as_bytes())
            .with_context(|| format!("replace Checks state {}", self.path.display()))
    }
}

fn short_id() -> String {
    Uuid::new_v4().simple().to_string()[..12].to_owned()
}

fn normalize_project_type(value: &str) -> String {
    match value.trim().to_ascii_lowercase().as_str() {
        "api" => "API".to_owned(),
        "mixed" => "Mixed".to_owned(),
        _ => "UI".to_owned(),
    }
}

fn schedule_next_at(frequency: &str, now: DateTime<Utc>) -> DateTime<Utc> {
    let normalized = frequency.trim().to_ascii_lowercase();
    let interval = if normalized.contains("minute") {
        Duration::minutes(parse_frequency_number(&normalized).unwrap_or(15))
    } else if normalized.contains("hour") {
        Duration::hours(parse_frequency_number(&normalized).unwrap_or(1))
    } else if normalized.contains("week") {
        Duration::weeks(parse_frequency_number(&normalized).unwrap_or(1))
    } else {
        Duration::days(parse_frequency_number(&normalized).unwrap_or(1))
    };
    now + interval
}

fn parse_frequency_number(value: &str) -> Option<i64> {
    value
        .split_whitespace()
        .find_map(|part| part.parse::<i64>().ok())
        .filter(|number| *number > 0)
}

fn format_schedule_time(value: DateTime<Utc>) -> String {
    value.format("%Y-%m-%d %H:%M UTC").to_string()
}

fn normalize_lines(lines: Vec<String>) -> Vec<String> {
    lines
        .into_iter()
        .map(|line| line.trim().to_owned())
        .filter(|line| !line.is_empty())
        .collect()
}

fn normalize_request_method(value: &str) -> String {
    match value.trim().to_ascii_uppercase().as_str() {
        "DELETE" => "DELETE".to_owned(),
        "PATCH" => "PATCH".to_owned(),
        "POST" => "POST".to_owned(),
        "PUT" => "PUT".to_owned(),
        _ => "GET".to_owned(),
    }
}

fn make_test(project: &Project, name: String, index: usize) -> TestCase {
    let normalized = name.to_ascii_lowercase();
    let feature = if normalized.contains("sign") || normalized.contains("auth") {
        "Authentication"
    } else if normalized.contains("search") || normalized.contains("find") {
        "Discovery"
    } else if normalized.contains("checkout") || normalized.contains("billing") {
        "Checkout"
    } else {
        "Core journey"
    };
    let test_type = if project.project_type == "API" {
        "API"
    } else {
        "UI"
    };
    let endpoint = project.url.clone();
    let source = if test_type == "API" {
        format!(
            "test(\"{}\", async () => {{\n  const response = await fetch(\"{}\", {{ method: \"GET\" }});\n  expect(response.status).toBe(200);\n}});",
            name.replace('"', "\\\""),
            endpoint
        )
    } else {
        format!(
            "test(\"{}\", async ({{ page }}) => {{\n  await page.goto(\"{}\");\n  await expect(page).toHaveTitle(/.+/);\n}});",
            name.replace('"', "\\\""),
            project.url
        )
    };
    TestCase {
        id: format!("{}-test-{}", project.id, index + 1),
        tenant: project.tenant.clone(),
        project_id: project.id.clone(),
        name,
        description: format!("Verify the {feature} journey against the live target."),
        priority: if index < 2 { "High" } else { "Medium" }.to_owned(),
        test_type: test_type.to_owned(),
        status: "idle".to_owned(),
        feature: feature.to_owned(),
        steps: vec![
            "Open the live target".to_owned(),
            "Observe the response and visible product signal".to_owned(),
            "Verify the expected journey evidence".to_owned(),
        ],
        assertions: vec![
            "The target responds without a transport error".to_owned(),
            "The live response contains the feature signal when one is known".to_owned(),
        ],
        source,
        request_method: "GET".to_owned(),
        request_path: None,
        expected_status: 200,
        response_assertions: Vec::new(),
        max_response_time_ms: None,
        updated: "Just now".to_owned(),
        latest_run_id: None,
    }
}

fn list_test_counts(tests: &[TestCase], project_ids: &[String]) -> (usize, usize) {
    tests
        .iter()
        .filter(|test| {
            project_ids
                .iter()
                .any(|project_id| project_id == &test.project_id)
        })
        .fold((0, 0), |(ui, api), test| {
            if test.test_type == "API" {
                (ui, api + 1)
            } else {
                (ui + 1, api)
            }
        })
}

fn list_test_counts_by_ids(tests: &[TestCase], test_ids: &[String]) -> (usize, usize) {
    tests
        .iter()
        .filter(|test| test_ids.iter().any(|test_id| test_id == &test.id))
        .fold((0, 0), |(ui, api), test| {
            if test.test_type == "API" {
                (ui, api + 1)
            } else {
                (ui + 1, api)
            }
        })
}

/// Enforce the browser-evidence retention limits on `runs` (newest first): only
/// the newest `max_runs` runs keep files, and only while their total stays within
/// `max_bytes`. Pruned records lose their screenshot/DOM flags so nothing claims a
/// file that is gone. Returns the evidence ids whose files the caller deletes
/// after the state is persisted.
fn prune_evidence(
    runs: &mut [RunRecord],
    evidence_dir: &Path,
    max_runs: usize,
    max_bytes: u64,
) -> Vec<String> {
    let has_files = |item: &crate::model::EvidenceRecord| {
        item.screenshot_available || item.dom_snapshot_available
    };
    let mut pruned = runs
        .iter()
        .skip(max_runs)
        .flat_map(|run| run.evidence.iter().filter(|item| has_files(item)))
        .map(|item| item.id.clone())
        .collect::<Vec<_>>();
    let retained = runs
        .iter()
        .take(max_runs)
        .flat_map(|run| run.evidence.iter().filter(|item| has_files(item)))
        .map(|item| item.id.clone())
        .collect::<Vec<_>>();
    pruned.extend(crate::evidence::over_budget(
        evidence_dir,
        &retained,
        max_bytes,
    ));
    if pruned.is_empty() {
        return pruned;
    }
    for run in runs.iter_mut() {
        for item in run
            .evidence
            .iter_mut()
            .filter(|item| pruned.contains(&item.id))
        {
            item.screenshot_available = false;
            item.dom_snapshot_available = false;
            item.browser_note =
                Some("Browser evidence was removed by this node's retention limit.".to_owned());
        }
        for failure in run
            .failures
            .iter_mut()
            .filter(|failure| pruned.contains(&failure.evidence_id))
        {
            failure.screenshot_available = false;
            failure.dom_snapshot = None;
        }
    }
    pruned
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn run_with_evidence(run_id: &str, evidence_id: &str) -> RunRecord {
        serde_json::from_value(json!({
            "id": run_id,
            "projectId": "project-1",
            "status": "completed",
            "verdict": "failed",
            "trigger": "manual",
            "startedAt": "2026-01-01T00:00:00Z",
            "finishedAt": "2026-01-01T00:00:01Z",
            "durationMs": 1,
            "passed": 0,
            "failed": 1,
            "skipped": 0,
            "coverage": 0,
            "summary": "",
            "evidenceLevel": "live-browser",
            "evidence": [{
                "id": evidence_id,
                "testId": "test-1",
                "url": "https://example.test/",
                "statusCode": 200,
                "title": null,
                "responseTimeMs": 1,
                "contentType": null,
                "textPreview": "",
                "screenshotAvailable": true,
                "domSnapshotAvailable": true,
                "level": "live-browser",
                "observedAt": "2026-01-01T00:00:00Z"
            }],
            "failures": [{
                "id": "failure-1",
                "testId": "test-1",
                "title": "t",
                "failedStep": "s",
                "rootCause": "r",
                "suggestedFix": "f",
                "source": "",
                "evidenceId": evidence_id,
                "screenshotAvailable": true,
                "domSnapshot": format!("/evidence/{evidence_id}")
            }]
        }))
        .expect("run record")
    }

    #[test]
    fn evidence_retention_prunes_old_and_oversized_runs() {
        let dir = tempfile_dir();
        for (id, size) in [
            ("evidence-new", 10),
            ("evidence-mid", 100),
            ("evidence-old", 10),
        ] {
            fs::write(crate::evidence::screenshot_path(&dir, id), vec![0_u8; size]).unwrap();
        }
        let mut runs = vec![
            run_with_evidence("run-new", "evidence-new"),
            run_with_evidence("run-mid", "evidence-mid"),
            run_with_evidence("run-old", "evidence-old"),
        ];

        let mut pruned = prune_evidence(&mut runs, &dir, 2, 50);
        pruned.sort();
        assert_eq!(pruned, ["evidence-mid", "evidence-old"]);
        assert!(runs[0].evidence[0].screenshot_available);
        for run in &runs[1..] {
            assert!(!run.evidence[0].screenshot_available);
            assert!(!run.evidence[0].dom_snapshot_available);
            assert!(run.evidence[0].browser_note.is_some());
            assert!(!run.failures[0].screenshot_available);
            assert!(run.failures[0].dom_snapshot.is_none());
        }
        // Already-pruned records are not reported again.
        assert!(prune_evidence(&mut runs, &dir, 2, 50).is_empty());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn creates_a_project_with_a_default_case() {
        let dir = tempfile_dir();
        let store = Store::open(dir.join("checks.json")).expect("store");
        let (project, tests) = store
            .create_project(
                "Demo".into(),
                "A demo target".into(),
                "UI".into(),
                "http://localhost:3000".into(),
                vec![],
                None,
                vec![],
            )
            .expect("project");
        assert_eq!(project.tests, 1);
        assert_eq!(tests.len(), 1);
        assert_eq!(store.snapshot().schema_version, SCHEMA_VERSION);
        let list = store.create_list("Release gate".into()).expect("list");
        assert_eq!(list.project_ids, vec![project.id]);
        assert_eq!(list.ui_tests, 1);
    }

    #[test]
    fn reads_legacy_type_projection_without_losing_the_project() {
        let dir = tempfile_dir();
        let path = dir.join("checks.json");
        let legacy = json!({
            "schemaVersion": SCHEMA_VERSION,
            "projects": [{
                "id": "legacy-project",
                "name": "Legacy",
                "description": "Legacy state",
                "projectType": "API",
                "url": "https://example.com",
                "tests": 1,
                "passed": 0,
                "attention": 0,
                "coverage": 0,
                "status": "idle",
                "lastRun": "Not run",
                "nextRun": "Not scheduled",
                "runtimeSelection": null,
                "latestRunId": null,
                "latestExplorationId": null,
                "createdAt": "2026-09-10T00:00:00Z",
                "updatedAt": "2026-09-10T00:00:00Z"
            }],
            "tests": [{
                "id": "legacy-test",
                "projectId": "legacy-project",
                "name": "Legacy case",
                "description": "Legacy case",
                "priority": "High",
                "testType": "API",
                "status": "idle",
                "feature": "Core journey",
                "steps": [],
                "assertions": [],
                "source": "",
                "updated": "Just now",
                "latestRunId": null
            }],
            "lists": [],
            "schedules": [],
            "runs": [],
            "explorations": []
        });
        fs::write(&path, serde_json::to_vec(&legacy).expect("legacy state"))
            .expect("write legacy state");
        let store = Store::open(path).expect("open legacy state");
        assert_eq!(
            store
                .get_project("legacy-project")
                .expect("project")
                .project_type,
            "API"
        );
        assert_eq!(
            store.tests_for_project("legacy-project")[0].test_type,
            "API"
        );
    }

    #[test]
    fn edits_a_plan_and_heals_a_failure_without_erasing_the_run() {
        let dir = tempfile_dir();
        let store = Store::open(dir.join("checks.json")).expect("store");
        let (project, tests) = store
            .create_project(
                "Demo".into(),
                "A demo target".into(),
                "UI".into(),
                "http://localhost:3000".into(),
                vec!["Sign in".into()],
                None,
                vec![],
            )
            .expect("project");
        let updated = store
            .update_test(
                &tests[0].id,
                None,
                Some("A refined journey".into()),
                Some(vec![
                    "Open sign in".into(),
                    "Submit credentials".into(),
                    " ".into(),
                ]),
                None,
                Some("Low".into()),
                None,
                None,
                None,
                None,
                None,
            )
            .expect("updated test");
        assert_eq!(updated.description, "A refined journey");
        assert_eq!(updated.steps, vec!["Open sign in", "Submit credentials"]);
        assert_eq!(updated.priority, "Low");

        let run: RunRecord = serde_json::from_value(json!({
            "id": "run-1",
            "projectId": project.id,
            "status": "completed",
            "verdict": "attention",
            "trigger": "manual",
            "startedAt": "2026-09-10T00:00:00Z",
            "finishedAt": "2026-09-10T00:00:01Z",
            "durationMs": 1,
            "passed": 0,
            "failed": 1,
            "skipped": 0,
            "coverage": 0,
            "summary": "One case needs attention.",
            "evidenceLevel": "live-http",
            "evidence": [{
                "id": "evidence-1",
                "testId": tests[0].id,
                "url": "http://localhost:3000",
                "statusCode": 200,
                "title": "Demo",
                "responseTimeMs": 1,
                "contentType": "text/html",
                "textPreview": "demo",
                "screenshotAvailable": false,
                "domSnapshotAvailable": false,
                "level": "live-http",
                "observedAt": "2026-09-10T00:00:01Z"
            }],
            "failures": [{
                "id": "failure-1",
                "testId": tests[0].id,
                "title": "Sign in needs attention",
                "failedStep": "Submit credentials",
                "rootCause": "coverage_signal_missing",
                "suggestedFix": "Refine the plan.",
                "source": "test source",
                "evidenceId": "evidence-1",
                "screenshotAvailable": false,
                "domSnapshot": null
            }],
            "explorationId": null
        }))
        .expect("run");
        store.save_run(run).expect("saved run");
        let healed = store
            .heal_failure("run-1", "failure-1")
            .expect("healed failure");
        assert_eq!(healed.failures[0].status, "healed");
        assert!(store.get_run("run-1").is_some());
        assert_eq!(store.tests_for_project(&project.id)[0].status, "idle");
    }

    #[test]
    fn schedules_have_a_real_next_run_and_advance_after_execution() {
        let dir = tempfile_dir();
        let store = Store::open(dir.join("checks.json")).expect("store");
        let list = store.create_list("Release gate".into()).expect("list");
        let schedule = store
            .create_schedule("Hourly gate".into(), list.id, "Every 1 hour".into())
            .expect("schedule");
        assert!(schedule.next_run_at.is_some());
        assert!(schedule.next_run.ends_with("UTC"));
        assert!(store.due_schedules(Utc::now()).is_empty());
        let updated = store
            .record_schedule_run("schedule-does-not-exist", "passed", Utc::now())
            .expect_err("missing schedule must fail");
        assert!(updated.to_string().contains("schedule not found"));
        let updated = store
            .record_schedule_run(&schedule.id, "passed", Utc::now())
            .expect("advanced schedule");
        assert_eq!(updated.last_result, "passed");
        assert!(updated.last_run_at.is_some());
    }

    fn tempfile_dir() -> PathBuf {
        let path = std::env::temp_dir().join(format!("ryu-checks-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).expect("temp dir");
        path
    }

    // ── at rest ──────────────────────────────────────────────────────────────

    const SECRET: &str = "zebra-checks-marker";

    fn keys(n: u8) -> PluginKeys {
        use base64::Engine as _;
        let subkey = base64::engine::general_purpose::STANDARD.encode([n; 32]);
        PluginKeys::sealing(
            ryu_crypto::PluginCipher::from_subkey_b64(PLUGIN_ID, &subkey).unwrap(),
            crate::seal_keys::KeySource::Delivered,
        )
    }

    fn create(store: &Store) -> Project {
        store
            .create_project(
                format!("Project {SECRET}"),
                "desc".into(),
                "UI".into(),
                "http://localhost:3000".into(),
                vec![],
                None,
                vec![],
            )
            .expect("project")
            .0
    }

    fn capture() -> crate::browser::BrowserCapture {
        crate::browser::BrowserCapture {
            final_url: None,
            title: None,
            screenshot_png: format!("PNG {SECRET}").into_bytes(),
            dom_snapshot: json!({ "text": SECRET }),
            rendered_text: String::new(),
        }
    }

    fn has(path: &Path, needle: &str) -> bool {
        let bytes = fs::read(path).unwrap_or_default();
        bytes.windows(needle.len()).any(|w| w == needle.as_bytes())
    }

    #[test]
    fn state_and_evidence_are_sealed_on_disk_and_read_back() {
        let dir = tempfile_dir();
        let path = dir.join("checks.json");
        let store = Store::open_with_keys(&path, &keys(1)).expect("store");
        let project = create(&store);
        assert!(!has(&path, SECRET));
        assert!(fs::read(&path).unwrap().starts_with(b"encb:v1:"));
        let evidence_dir = store.evidence_dir();
        let seal = store.evidence_seal.clone();
        crate::evidence::write(&evidence_dir, &seal, "evidence-1", &capture()).unwrap();
        for file in [
            crate::evidence::screenshot_path(&evidence_dir, "evidence-1"),
            crate::evidence::dom_path(&evidence_dir, "evidence-1"),
        ] {
            assert!(!has(&file, SECRET));
            assert!(ryu_crypto::sealed_file::is_sealed_file(&file).unwrap());
        }
        let (png, dom) = store.read_evidence("evidence-1").unwrap();
        use base64::Engine as _;
        let png = base64::engine::general_purpose::STANDARD
            .decode(png.unwrap())
            .unwrap();
        assert_eq!(png, format!("PNG {SECRET}").into_bytes());
        assert_eq!(dom.unwrap()["text"], SECRET);
        drop(store);
        let again = Store::open_with_keys(&path, &keys(1)).expect("reopen");
        assert!(again.get_project(&project.id).is_some());
    }

    #[test]
    fn evidence_moved_to_another_id_does_not_open() {
        let dir = tempfile_dir();
        let store = Store::open_with_keys(dir.join("checks.json"), &keys(2)).expect("store");
        let evidence_dir = store.evidence_dir();
        crate::evidence::write(
            &evidence_dir,
            &store.evidence_seal,
            "evidence-a",
            &capture(),
        )
        .unwrap();
        fs::copy(
            crate::evidence::screenshot_path(&evidence_dir, "evidence-a"),
            crate::evidence::screenshot_path(&evidence_dir, "evidence-b"),
        )
        .unwrap();
        assert!(store.read_evidence("evidence-b").is_err());
        // A truncated file is detected, not served short.
        let file = crate::evidence::screenshot_path(&evidence_dir, "evidence-a");
        let bytes = fs::read(&file).unwrap();
        fs::write(&file, &bytes[..bytes.len() - 5]).unwrap();
        assert!(store.read_evidence("evidence-a").is_err());
    }

    #[test]
    fn legacy_plaintext_state_and_evidence_are_sealed_and_still_read() {
        let dir = tempfile_dir();
        let path = dir.join("checks.json");
        let project = {
            let store = Store::open_with_keys(&path, &PluginKeys::compat()).expect("compat");
            assert_eq!(store.seal_health()["state"], "compat");
            let project = create(&store);
            crate::evidence::write(
                &store.evidence_dir(),
                &store.evidence_seal,
                "evidence-old",
                &capture(),
            )
            .unwrap();
            project
        };
        assert!(has(&path, SECRET));
        let evidence_dir = dir.join(crate::evidence::EVIDENCE_DIR_NAME);
        let png = crate::evidence::screenshot_path(&evidence_dir, "evidence-old");
        assert!(has(&png, SECRET));
        let store = Store::open_with_keys(&path, &keys(3)).expect("sealing");
        assert!(store.get_project(&project.id).is_some());
        assert!(!has(&path, SECRET));
        // Legacy files read before and after the background pass seals them.
        assert!(store.read_evidence("evidence-old").unwrap().0.is_some());
        let (sealed, failed) =
            crate::evidence::seal_legacy_files(&evidence_dir, &store.evidence_seal);
        assert_eq!(failed, 0);
        assert!(sealed <= 2);
        assert!(!has(&png, SECRET));
        assert!(store.read_evidence("evidence-old").unwrap().1.is_some());
        // Idempotent.
        assert_eq!(
            crate::evidence::seal_legacy_files(&evidence_dir, &store.evidence_seal),
            (0, 0)
        );
        let before = fs::read(&path).unwrap();
        drop(store);
        let again = Store::open_with_keys(&path, &keys(3)).expect("reopen");
        assert_eq!(
            fs::read(&path).unwrap(),
            before,
            "a second open must not rewrite the state"
        );
        assert!(again.get_project(&project.id).is_some());
    }

    #[test]
    fn another_key_or_no_key_refuses_writes_and_keeps_the_data() {
        let dir = tempfile_dir();
        let path = dir.join("checks.json");
        create(&Store::open_with_keys(&path, &keys(4)).expect("store"));
        let sealed = fs::read(&path).unwrap();
        for other in [keys(5), PluginKeys::compat()] {
            let store = Store::open_with_keys(&path, &other).expect("opens unhealthy");
            assert_eq!(store.seal_health()["state"], "unhealthy");
            assert!(store.create_list("x".into()).is_err());
            assert!(crate::evidence::write(
                &store.evidence_dir(),
                &store.evidence_seal,
                "evidence-z",
                &capture()
            )
            .is_err());
            assert_eq!(fs::read(&path).unwrap(), sealed);
        }
        let back = Store::open_with_keys(&path, &keys(4)).expect("back");
        assert_eq!(back.snapshot().projects.len(), 1);
    }
}
