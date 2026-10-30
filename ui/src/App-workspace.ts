import type { RyuCatalogSnapshot } from "@ryu/app-host/app-bridge";
import type { RyuPickerSelection } from "@ryu/blocks/composer/runtime-picker";
import { useLiteralMessages } from "@ryu/i18n/react";
import { useCallback, useEffect, useState } from "react";
import { useChecksScheduleActions } from "./App-workspace-schedules.ts";
import {
	createList as createListRequest,
	createProject as createProjectRequest,
	exploreProject as exploreProjectRequest,
	getAnalytics,
	getBootstrap,
	healFailure as healFailureRequest,
	loadRuntimeCatalog,
	runAgentLane,
	runList as runListRequest,
	runProject as runProjectRequest,
	runTest as runTestRequest,
	saveAgentRun as saveAgentRunRequest,
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
import { checksAgentReportSchema } from "./schemas.ts";
import type { Screen } from "./screen-model.ts";

interface ParseAgentReportResult {
	artifacts: AgentRun["artifacts"];
	evidenceLevel?: string;
	verdict?: string;
}

function parseAgentReport(transcript: string): ParseAgentReportResult {
	try {
		const parsed = checksAgentReportSchema.safeParse(JSON.parse(transcript));
		return parsed.success ? parsed.data : { artifacts: [] };
	} catch {
		return { artifacts: [] };
	}
}

export function useChecksWorkspace(navigate: (next: Screen) => void) {
	const tl = useLiteralMessages();
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
			notify(
				tl("Running {name} against {url}…", {
					name: project.name,
					url: project.url,
				})
			);
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
							? tl("{message} Falling back to live HTTP evidence.", {
									message: error.message,
								})
							: "Agent lane unavailable; falling back to live HTTP evidence."
					);
				}
			}
			try {
				const run = await runProjectRequest(id);
				syncProjectFromRun(run);
				notify(
					run.failed === 0
						? tl("{name} passed with live evidence.", { name: project.name })
						: tl(
								"{name} finished with {failed, plural, one {{failedLabel} failure bundle} other {{failedLabel} failure bundles}}.",
								{
									failed: run.failed,
									failedLabel: String(run.failed),
									name: project.name,
								}
							)
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
		[notify, projects, syncProjectFromRun, tests, tl]
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
					tl("Exploration mapped {length} feature areas.", {
						length: String(
							exploration.featureAreas.filter((area) => area.observed).length
						),
					})
				);
			} catch (error) {
				notify(
					error instanceof Error
						? error.message
						: "The target could not be explored."
				);
			}
		},
		[notify, tl]
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
				notify(
					tl("{name} is ready to explore.", { name: created.project.name })
				);
			} catch (error) {
				notify(
					error instanceof Error
						? error.message
						: "The project could not be saved."
				);
			}
		},
		[navigate, notify, tl]
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
				notify(tl("{name} is ready for a local run.", { name }));
			} catch (error) {
				notify(
					error instanceof Error
						? error.message
						: "The test list could not be saved."
				);
			}
		},
		[notify, tl]
	);

	const runList = useCallback(
		async (list: TestList) => {
			try {
				const result = await runListRequest(list.id);
				result.runs.forEach(syncProjectFromRun);
				notify(
					tl(
						"{name} finished with {count, plural, one {{countLabel} attention run} other {{countLabel} attention runs}}.",
						{
							count: result.runs.filter((run) => run.failed > 0).length,
							countLabel: String(
								result.runs.filter((run) => run.failed > 0).length
							),
							name: list.name,
						}
					)
				);
			} catch (error) {
				notify(
					error instanceof Error
						? error.message
						: "The test list could not run."
				);
			}
		},
		[notify, syncProjectFromRun, tl]
	);

	const { createSchedule, runSchedule, setScheduleActive } =
		useChecksScheduleActions(notify, setSchedules, syncProjectFromRun);

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

	return {
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
	};
}
