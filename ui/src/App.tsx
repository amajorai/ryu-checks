import { Button } from "@ryu/ui/components/button.tsx";
import { useCallback, useMemo, useState } from "react";
import { useChecksWorkspace } from "./App-workspace.ts";
import {
	discoverRuntimeModels,
	generatePlanWithModel,
	getEvidenceArtifacts,
} from "./bridge.ts";
import { Glyph } from "./icons.tsx";
import type { Screen } from "./screen-model.ts";
import { CreateTestsPage } from "./screens-create-tests.tsx";
import { AllTestsPage, HomePage } from "./screens-dashboard.tsx";
import { ProjectDetailPage } from "./screens-project-detail.tsx";
import {
	MonitoringPage,
	SettingsPage,
	TestDetailPage,
	TestListsPage,
} from "./screens-secondary.tsx";

export { runtimeSelectionLabel } from "./runtime-selection.ts";

function App() {
	const [screen, setScreen] = useState<Screen>(() => {
		const requested =
			globalThis.window?.ryu?.context?.screen ??
			new URLSearchParams(globalThis.window?.location.search).get("screen") ??
			undefined;
		switch (requested) {
			case "all-tests-ui":
				return { kind: "all-tests", filter: "UI" };
			case "all-tests-api":
				return { kind: "all-tests", filter: "API" };
			case "all-tests":
				return { kind: "all-tests", filter: "All" };
			case "create-tests":
				return { kind: "create-tests", step: 0 };
			case "test-lists":
				return { kind: "test-lists" };
			case "monitoring":
				return { kind: "monitoring" };
			case "settings-api-keys":
				return { kind: "settings", section: "api-keys" };
			case "settings-github":
				return { kind: "settings", section: "github" };
			case "settings-capabilities":
				return { kind: "settings", section: "capabilities" };
			default:
				return { kind: "home" };
		}
	});
	const navigate = useCallback((next: Screen) => setScreen(next), []);
	const {
		agentRuns,
		agentTranscripts,
		analytics,
		createList,
		createProject,
		createSchedule,
		explorations,
		exploreProject,
		healFailure,
		lists,
		loading,
		notify,
		projects,
		refreshWorkspace,
		runList,
		runProject,
		runSchedule,
		runTest,
		runs,
		runtimeCatalog,
		schedules,
		setScheduleActive,
		tests,
		toast,
		updateList,
		updateTest,
	} = useChecksWorkspace(navigate);

	const currentProject = useMemo(() => {
		if (screen.kind === "project") {
			return projects.find((project) => project.id === screen.id);
		}
		if (screen.kind === "test") {
			return projects.find((project) => project.id === screen.projectId);
		}
		return undefined;
	}, [projects, screen]);
	const currentTest =
		screen.kind === "test"
			? tests.find((test) => test.id === screen.testId)
			: undefined;
	const currentRun = currentProject?.latestRunId
		? runs.find((run) => run.id === currentProject.latestRunId)
		: undefined;
	const currentExploration = currentProject?.latestExplorationId
		? explorations.find(
				(item) => item.id === currentProject.latestExplorationId
			)
		: undefined;
	const title =
		screen.kind === "home"
			? "Home"
			: screen.kind === "all-tests"
				? "All Tests"
				: screen.kind === "create-tests"
					? "Create Tests"
					: screen.kind === "test-lists"
						? "Test Lists"
						: screen.kind === "monitoring"
							? "Monitoring"
							: screen.kind === "settings"
								? "Settings"
								: (currentProject?.name ?? "Tests");

	return (
		<div aria-busy={loading} className="checks-app">
			<main className="app-main">
				<header className="app-topbar">
					<div className="topbar-context">
						<span className="topbar-dot" />
						<span>Ryu / Tests</span>
						<Glyph name="arrow-right" />
						<strong>{title}</strong>
					</div>
					<div className="topbar-actions">
						<Button
							aria-label="Refresh verification workspace"
							onClick={() => void refreshWorkspace()}
							size="icon-sm"
							type="button"
							variant="ghost"
						>
							<Glyph name="activity" />
						</Button>
						<Button
							onClick={() =>
								notify("Checks stores live evidence in the node-local sidecar.")
							}
							size="sm"
							type="button"
							variant="ghost"
						>
							Help
						</Button>
						<span className="topbar-avatar">J</span>
					</div>
				</header>
				<div className="app-scroll">
					{screen.kind === "home" ? (
						<HomePage
							analytics={analytics}
							onNavigate={navigate}
							projects={projects}
							runs={runs}
						/>
					) : null}
					{screen.kind === "all-tests" ? (
						<AllTestsPage
							onNavigate={navigate}
							onRunProject={(id) => void runProject(id)}
							projects={projects}
							screen={screen}
						/>
					) : null}
					{screen.kind === "create-tests" ? (
						<CreateTestsPage
							onCreate={(draft) => void createProject(draft)}
							onDiscoverModels={discoverRuntimeModels}
							onGeneratePlan={generatePlanWithModel}
							onNavigate={navigate}
							runtimeCatalog={runtimeCatalog}
							step={screen.step}
						/>
					) : null}
					{screen.kind === "test-lists" ? (
						<TestListsPage
							lists={lists}
							onCreate={(name) => void createList(name)}
							onRun={(list) => void runList(list)}
							onUpdateList={updateList}
							tests={tests}
						/>
					) : null}
					{screen.kind === "monitoring" ? (
						<MonitoringPage
							lists={lists}
							onCreateSchedule={createSchedule}
							onRunSchedule={(schedule) => void runSchedule(schedule)}
							onToggleSchedule={setScheduleActive}
							schedules={schedules}
						/>
					) : null}
					{screen.kind === "settings" ? (
						<SettingsPage onNavigate={navigate} section={screen.section} />
					) : null}
					{screen.kind === "project" && currentProject ? (
						<ProjectDetailPage
							agentRun={agentRuns.find(
								(run) => run.projectId === currentProject.id
							)}
							agentTranscript={
								agentRuns.find((run) => run.projectId === currentProject.id)
									?.transcript ?? agentTranscripts[currentProject.id]
							}
							exploration={currentExploration}
							onExplore={() => void exploreProject(currentProject.id)}
							onHealFailure={healFailure}
							onLoadEvidence={getEvidenceArtifacts}
							onNavigate={navigate}
							onRun={() => void runProject(currentProject.id)}
							project={currentProject}
							run={currentRun}
							runs={runs.filter((run) => run.projectId === currentProject.id)}
							tab={screen.tab}
							tests={tests}
						/>
					) : null}
					{screen.kind === "test" && currentProject && currentTest ? (
						<TestDetailPage
							onNavigate={navigate}
							onRun={() => void runTest(currentTest.id)}
							onRunProject={() => void runProject(currentProject.id)}
							onUpdateTest={updateTest}
							panel={screen.panel}
							project={currentProject}
							run={currentRun}
							test={currentTest}
						/>
					) : null}
				</div>
			</main>
			{toast ? (
				<div aria-live="polite" className="toast">
					<span className="toast-icon">
						<Glyph name="check" />
					</span>
					<span>{toast}</span>
				</div>
			) : null}
		</div>
	);
}

export { App };
