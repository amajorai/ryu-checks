import type { RyuCatalogSnapshot } from "@ryu/app-host/app-bridge";
import type { RyuPickerSelection } from "@ryu/blocks/composer/runtime-picker";
import { Button } from "@ryu/ui/components/button.tsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	createList as createListRequest,
	createProject as createProjectRequest,
	createSchedule as createScheduleRequest,
	discoverRuntimeModels,
	exploreProject as exploreProjectRequest,
	generatePlanWithModel,
	getAnalytics,
	getBootstrap,
	healFailure as healFailureRequest,
	loadRuntimeCatalog,
	runAgentLane,
	runList as runListRequest,
	runProject as runProjectRequest,
	runSchedule as runScheduleRequest,
	runTest as runTestRequest,
	saveAgentRun as saveAgentRunRequest,
	toggleSchedule,
	updateList as updateListRequest,
	updateTest as updateTestRequest,
} from "./bridge.ts";
import type {
	AgentRun,
	Analytics,
	ContextSource,
	ExplorationRecord,
	Project,
	Schedule,
	TestCase,
	TestList,
	TestRun,
} from "./data.ts";
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

function parseAgentReport(transcript: string): {
	artifacts: AgentRun["artifacts"];
	evidenceLevel?: string;
	verdict?: string;
} {
	try {
		const parsed: unknown = JSON.parse(transcript);
		if (typeof parsed !== "object" || parsed === null) {
			return { artifacts: [] };
		}
		const value = parsed as {
			artifacts?: unknown;
			evidenceLevel?: unknown;
			verdict?: unknown;
		};
		const artifacts = Array.isArray(value.artifacts)
			? value.artifacts.flatMap((artifact) => {
					if (typeof artifact !== "object" || artifact === null) {
						return [];
					}
					const item = artifact as {
						available?: unknown;
						kind?: unknown;
						label?: unknown;
						reference?: unknown;
					};
					if (typeof item.kind !== "string" || typeof item.label !== "string") {
						return [];
					}
					return [
						{
							available: item.available === true,
							kind: item.kind,
							label: item.label,
							reference:
								typeof item.reference === "string" ? item.reference : undefined,
						},
					];
				})
			: [];
		return {
			artifacts,
			evidenceLevel:
				typeof value.evidenceLevel === "string"
					? value.evidenceLevel
					: undefined,
			verdict: typeof value.verdict === "string" ? value.verdict : undefined,
		};
	} catch {
		return { artifacts: [] };
	}
}

function App() {
	const [screen, setScreen] = useState<Screen>(() => {
		const requested =
			typeof window === "undefined"
				? undefined
				: (window.ryu?.context?.screen ??
					new URLSearchParams(window.location.search).get("screen") ??
					undefined);
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
	const [runtimeCatalog, setRuntimeCatalog] =
		useState<RyuCatalogSnapshot | null>(null);
	const [projects, setProjects] = useState<Project[]>([]);
	const [tests, setTests] = useState<TestCase[]>([]);
	const [lists, setLists] = useState<TestList[]>([]);
	const [schedules, setSchedules] = useState<Schedule[]>([]);
	const [runs, setRuns] = useState<TestRun[]>([]);
	const [explorations, setExplorations] = useState<ExplorationRecord[]>([]);
	const [analytics, setAnalytics] = useState<Analytics | null>(null);
	const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
	const [agentTranscripts, setAgentTranscripts] = useState<
		Record<string, string>
	>({});
	const [loading, setLoading] = useState(true);
	const [toast, setToast] = useState<string | null>(null);

	const notify = useCallback((message: string) => setToast(message), []);
	const refreshWorkspace = useCallback(async () => {
		setLoading(true);
		try {
			const [workspace, metrics] = await Promise.all([
				getBootstrap(),
				getAnalytics(),
			]);
			setProjects(workspace.projects);
			setTests(workspace.tests);
			setLists(workspace.lists);
			setSchedules(workspace.schedules);
			setRuns(workspace.runs);
			setExplorations(workspace.explorations);
			setAgentRuns(workspace.agentRuns);
			setAnalytics(metrics);
		} catch (error) {
			notify(
				error instanceof Error
					? error.message
					: "Checks could not load the node workspace."
			);
		} finally {
			setLoading(false);
		}
	}, [notify]);

	useEffect(() => {
		void refreshWorkspace();
		void loadRuntimeCatalog().then(setRuntimeCatalog);
	}, [refreshWorkspace]);

	useEffect(() => {
		if (!toast) {
			return;
		}
		const timeout = window.setTimeout(() => setToast(null), 3200);
		return () => window.clearTimeout(timeout);
	}, [toast]);

	const navigate = useCallback((next: Screen) => setScreen(next), []);

	const syncProjectFromRun = useCallback((run: TestRun) => {
		setRuns((current) => [
			run,
			...current.filter((item) => item.id !== run.id),
		]);
		setProjects((current) =>
			current.map((project) =>
				project.id === run.projectId
					? run.scope === "test"
						? {
								...project,
								lastRun: "Just now",
								latestRunId: run.id,
							}
						: {
								...project,
								attention: run.failed,
								coverage: run.coverage,
								lastRun: "Just now",
								latestRunId: run.id,
								passed: run.passed,
								status: run.failed === 0 ? "passed" : "attention",
							}
					: project
			)
		);
	}, []);

	const runProject = useCallback(
		async (id: string) => {
			const project = projects.find((item) => item.id === id);
			if (!project) {
				return;
			}
			setProjects((current) =>
				current.map((item) =>
					item.id === id ? { ...item, status: "running" } : item
				)
			);
			notify(`Running ${project.name} against ${project.url}…`);
			if (project.runtimeSelection?.kind === "agent") {
				try {
					const transcript = await runAgentLane({
						agentId: project.runtimeSelection.agentId,
						project,
						tests: tests.filter((test) => test.projectId === project.id),
					});
					setAgentTranscripts((current) => ({ ...current, [id]: transcript }));
					const report = parseAgentReport(transcript);
					const saved = await saveAgentRunRequest(id, {
						agentId: project.runtimeSelection.agentId,
						evidenceLevel: report.evidenceLevel,
						verdict: report.verdict,
						transcript,
						artifacts: report.artifacts,
					});
					setAgentRuns((current) => [
						saved,
						...current.filter((item) => item.id !== saved.id),
					]);
				} catch (error) {
					notify(
						error instanceof Error
							? `${error.message} Falling back to live HTTP evidence.`
							: "Agent lane unavailable; falling back to live HTTP evidence."
					);
				}
			}
			try {
				const run = await runProjectRequest(id);
				syncProjectFromRun(run);
				notify(
					run.failed === 0
						? `${project.name} passed with live evidence.`
						: `${project.name} finished with ${run.failed} failure bundle${run.failed === 1 ? "" : "s"}.`
				);
			} catch (error) {
				setProjects((current) =>
					current.map((item) =>
						item.id === id ? { ...item, status: "attention" } : item
					)
				);
				notify(
					error instanceof Error
						? error.message
						: "The live target could not be verified."
				);
			}
		},
		[notify, projects, syncProjectFromRun, tests]
	);

	const runTest = useCallback(
		async (testId: string) => {
			try {
				const run = await runTestRequest(testId);
				syncProjectFromRun(run);
				notify(
					run.failed === 0
						? "The case passed with live evidence."
						: "The case finished with a failure bundle."
				);
			} catch (error) {
				notify(
					error instanceof Error
						? error.message
						: "The test case could not be verified."
				);
			}
		},
		[notify, syncProjectFromRun]
	);

	const exploreProject = useCallback(
		async (id: string) => {
			try {
				const exploration = await exploreProjectRequest(id);
				setExplorations((current) => [
					exploration,
					...current.filter((item) => item.id !== exploration.id),
				]);
				setProjects((current) =>
					current.map((project) =>
						project.id === id
							? { ...project, latestExplorationId: exploration.id }
							: project
					)
				);
				notify(
					`Exploration mapped ${exploration.featureAreas.filter((area) => area.observed).length} feature areas.`
				);
			} catch (error) {
				notify(
					error instanceof Error
						? error.message
						: "The target could not be explored."
				);
			}
		},
		[notify]
	);

	const createProject = useCallback(
		async (draft: {
			name: string;
			type: "UI" | "API" | "Mixed";
			url: string;
			prd: string;
			testNames: string[];
			runtimeSelection?: RyuPickerSelection;
			contextSources?: ContextSource[];
		}) => {
			try {
				const created = await createProjectRequest({
					description: draft.prd,
					name: draft.name,
					projectType: draft.type,
					runtimeSelection: draft.runtimeSelection,
					contextSources: draft.contextSources,
					testNames: draft.testNames,
					url: draft.url,
				});
				setProjects((current) => [created.project, ...current]);
				setTests((current) => [...created.tests, ...current]);
				navigate({ kind: "project", id: created.project.id, tab: "flow" });
				notify(`${created.project.name} is ready to explore.`);
			} catch (error) {
				notify(
					error instanceof Error
						? error.message
						: "The project could not be saved."
				);
			}
		},
		[navigate, notify]
	);

	const updateList = useCallback(
		async (listId: string, testIds: string[]) => {
			try {
				const updated = await updateListRequest(listId, testIds);
				setLists((current) =>
					current.map((list) => (list.id === updated.id ? updated : list))
				);
				notify("Collection membership saved.");
			} catch (error) {
				notify(
					error instanceof Error
						? error.message
						: "The collection membership could not be saved."
				);
			}
		},
		[notify]
	);

	const createList = useCallback(
		async (name: string) => {
			try {
				const list = await createListRequest(name);
				setLists((current) => [list, ...current]);
				notify(`${name} is ready for a local run.`);
			} catch (error) {
				notify(
					error instanceof Error
						? error.message
						: "The test list could not be saved."
				);
			}
		},
		[notify]
	);

	const runList = useCallback(
		async (list: TestList) => {
			try {
				const result = await runListRequest(list.id);
				result.runs.forEach(syncProjectFromRun);
				notify(
					`${list.name} finished with ${result.runs.filter((run) => run.failed > 0).length} attention run${result.runs.filter((run) => run.failed > 0).length === 1 ? "" : "s"}.`
				);
			} catch (error) {
				notify(
					error instanceof Error
						? error.message
						: "The test list could not run."
				);
			}
		},
		[notify, syncProjectFromRun]
	);

	const createSchedule = useCallback(
		async (input: { name: string; listId: string; frequency: string }) => {
			try {
				const schedule = await createScheduleRequest(input);
				setSchedules((current) => [schedule, ...current]);
				notify("The schedule is saved on this node.");
			} catch (error) {
				notify(
					error instanceof Error
						? error.message
						: "The schedule could not be saved."
				);
			}
		},
		[notify]
	);

	const setScheduleActive = useCallback(
		async (schedule: Schedule, active: boolean) => {
			try {
				const updated = await toggleSchedule(schedule.id, active);
				setSchedules((current) =>
					current.map((item) => (item.id === updated.id ? updated : item))
				);
			} catch (error) {
				notify(
					error instanceof Error
						? error.message
						: "The schedule could not be updated."
				);
			}
		},
		[notify]
	);

	const runSchedule = useCallback(
		async (schedule: Schedule) => {
			try {
				const result = await runScheduleRequest(schedule.id);
				result.runs.forEach(syncProjectFromRun);
				setSchedules((current) =>
					current.map((item) =>
						item.id === result.schedule.id ? result.schedule : item
					)
				);
				notify(
					`${schedule.name} finished with ${result.runs.filter((run) => run.failed > 0).length} attention run${result.runs.filter((run) => run.failed > 0).length === 1 ? "" : "s"}.`
				);
			} catch (error) {
				notify(
					error instanceof Error ? error.message : "The schedule could not run."
				);
			}
		},
		[notify, syncProjectFromRun]
	);

	const healFailure = useCallback(
		async (runId: string, failureId: string) => {
			try {
				const run = await healFailureRequest(runId, failureId);
				syncProjectFromRun(run);
				notify(
					"The plan was auto-healed; rerun it to verify the updated signal."
				);
			} catch (error) {
				notify(
					error instanceof Error
						? error.message
						: "The failure bundle could not be healed."
				);
			}
		},
		[notify, syncProjectFromRun]
	);

	const updateTest = useCallback(
		async (
			testId: string,
			input: {
				description?: string;
				priority?: "High" | "Medium" | "Low";
				steps?: string[];
				requestMethod?: string;
				requestPath?: string;
				expectedStatus?: number;
				responseAssertions?: string[];
				maxResponseTimeMs?: number;
			}
		) => {
			try {
				const updated = await updateTestRequest(testId, input);
				setTests((current) =>
					current.map((test) => (test.id === updated.id ? updated : test))
				);
				notify("Test plan saved. Run it to attach fresh evidence.");
			} catch (error) {
				notify(
					error instanceof Error
						? error.message
						: "The test plan could not be saved."
				);
				throw error;
			}
		},
		[notify]
	);

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
							className="topbar-icon"
							onClick={() => void refreshWorkspace()}
							type="button"
						>
							<Glyph name="activity" />
						</Button>
						<Button
							className="topbar-help"
							onClick={() =>
								notify("Checks stores live evidence in the node-local sidecar.")
							}
							type="button"
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
