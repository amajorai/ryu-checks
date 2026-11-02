use anyhow::{anyhow, Context, Result};

use crate::model::RunRecord;
use crate::model::TenantContext;
use crate::runner;
use crate::store::Store;

/// Every recurring execution revalidates the retained principal before looking up
/// tenant-owned targets. Legacy managed schedules have no execution proof.
pub async fn run_scheduled_list(
    store: &Store,
    schedule: &crate::model::Schedule,
    authorization: Option<&crate::authorization::AuthorizationClient>,
) -> Result<Vec<RunRecord>> {
    let context = TenantContext {
        owner_user_id: schedule.tenant.owner_user_id.clone(),
        org_id: schedule.tenant.org_id.clone(),
        node_id: schedule
            .tenant
            .node_id
            .clone()
            .context("schedule node binding is missing")?,
    };
    if !schedule.active || context.node_id != store.node_id() {
        anyhow::bail!("schedule is inactive or belongs to a different node");
    }
    match (authorization, schedule.execution_authorization.as_deref()) {
        (Some(client), Some(proof)) => client.check(&context, proof).await?,
        (_, None) if crate::authorization::local_owner(&context) => {}
        _ => anyhow::bail!(
            "schedule execution authorization unavailable; enable it again with run permission"
        ),
    }
    let current = store
        .snapshot_for(&context)
        .schedules
        .into_iter()
        .find(|current| current.id == schedule.id && current.active)
        .context("schedule was paused or removed before execution")?;
    if current.list_id != schedule.list_id
        || current.execution_authorization != schedule.execution_authorization
    {
        anyhow::bail!("schedule changed before execution");
    }
    run_list_for(store, &context, &schedule.list_id, "schedule").await
}

/// Shared execution operation used by HTTP, CLI, and MCP. Keeping this in one
/// service seam prevents the agent-facing entry points from drifting from the
/// Companion's persisted evidence contract.
pub async fn run_project_for(
    store: &Store,
    context: &TenantContext,
    project_id: &str,
    trigger: &str,
) -> Result<RunRecord> {
    let tests = store.tests_for_project_for(context, project_id);
    run_project_with_tests_for(store, context, project_id, tests, trigger).await
}

async fn run_project_with_tests_for(
    store: &Store,
    context: &TenantContext,
    project_id: &str,
    tests: Vec<crate::model::TestCase>,
    trigger: &str,
) -> Result<RunRecord> {
    let project = store
        .get_project_for(context, project_id)
        .ok_or_else(|| anyhow!("project not found: {project_id}"))?;
    let exploration = runner::explore(&project).await.ok();
    if let Some(exploration) = exploration.as_ref() {
        store.save_exploration_for(context, exploration.clone())?;
    }
    let mut run = runner::run_project(&project, &tests, trigger, &store.evidence_env()).await?;
    run.exploration_id = exploration.map(|item| item.id);
    store.save_run_for(context, run.clone())?;
    Ok(run)
}

pub async fn run_test_for(
    store: &Store,
    context: &TenantContext,
    test_id: &str,
    trigger: &str,
) -> Result<RunRecord> {
    let state = store.snapshot_for(context);
    let test = state
        .tests
        .iter()
        .find(|test| test.id == test_id)
        .cloned()
        .ok_or_else(|| anyhow!("test case not found: {test_id}"))?;
    let project = state
        .projects
        .iter()
        .find(|project| project.id == test.project_id)
        .cloned()
        .ok_or_else(|| anyhow!("project not found: {}", test.project_id))?;
    let mut run = runner::run_project(&project, &[test], trigger, &store.evidence_env()).await?;
    run.scope = "test".to_owned();
    run.target_test_id = Some(test_id.to_owned());
    store.save_run_for(context, run.clone())?;
    Ok(run)
}

/// Execute every project in a retained collection through the same path as a
/// single project. This keeps exploration, persistence, and evidence semantics
/// identical for the Companion, CLI, MCP, schedules, and agent tools.
pub async fn run_list_for(
    store: &Store,
    context: &TenantContext,
    list_id: &str,
    trigger: &str,
) -> Result<Vec<RunRecord>> {
    let state = store.snapshot_for(context);
    let list = state
        .lists
        .iter()
        .find(|list| list.id == list_id)
        .context("test list not found")?;
    let project_ids = if list.project_ids.is_empty() {
        state
            .projects
            .iter()
            .map(|project| project.id.clone())
            .collect::<Vec<_>>()
    } else {
        list.project_ids.clone()
    };
    if !list.test_ids.is_empty() {
        let mut runs = Vec::new();
        let mut project_tests = std::collections::BTreeMap::<String, Vec<_>>::new();
        for test_id in &list.test_ids {
            if let Some(test) = state.tests.iter().find(|test| &test.id == test_id) {
                project_tests
                    .entry(test.project_id.clone())
                    .or_default()
                    .push(test.clone());
            }
        }
        for (project_id, tests) in project_tests {
            runs.push(
                run_project_with_tests_for(store, context, &project_id, tests, trigger).await?,
            );
        }
        return Ok(runs);
    }
    let mut runs = Vec::with_capacity(project_ids.len());
    for project_id in project_ids {
        runs.push(run_project_for(store, context, &project_id, trigger).await?);
    }
    Ok(runs)
}
