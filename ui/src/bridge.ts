import type {
	RyuCatalogModels,
	RyuCatalogSnapshot,
	RyuRuntimeSelection,
} from "@ryu/app-host/app-bridge";
import type { z } from "zod";
import type {
	AgentRun,
	Analytics,
	BootstrapResponse,
	ContextSource,
	EvidenceArtifacts,
	ExplorationRecord,
	Project,
	Schedule,
	TestCase,
	TestList,
	TestRun,
} from "./data.ts";
import {
	agentRunSchema,
	analyticsSchema,
	bootstrapResponseSchema,
	type ChecksAppRequestBody,
	checksApiFailureSchema,
	checksPlanSchema,
	deletionResponseSchema,
	evidenceArtifactsSchema,
	explorationRecordSchema,
	listRunsResponseSchema,
	preserveChecksResponse,
	projectCreationResponseSchema,
	scheduleRunResponseSchema,
	scheduleSchema,
	testCaseSchema,
	testListSchema,
	testRunSchema,
} from "./schemas.ts";

export { subscribeCompanionTheme as subscribeLiveTheme } from "@ryu/app-host/companion-theme";

export class ChecksApiError extends Error {
	readonly code: string;
	readonly status: number;

	constructor(status: number, code: string, message: string) {
		super(message);
		this.name = "ChecksApiError";
		this.status = status;
		this.code = code;
	}
}

function bridge() {
	return globalThis.window?.ryu;
}

async function directRequest<T>(
	schema: z.ZodType<T>,
	path: string,
	method: "DELETE" | "GET" | "PATCH" | "POST" = "GET",
	body?: ChecksAppRequestBody
): Promise<T> {
	const init: RequestInit = { method };
	if (body !== undefined && method !== "GET") {
		init.body = JSON.stringify(body);
		init.headers = { "content-type": "application/json" };
	}
	const response = await fetch(`/api/checks${path}`, init);
	const payload: Parameters<typeof checksApiFailureSchema.parse>[0] =
		await response.json().catch(() => null);
	if (!response.ok) {
		const failure = checksApiFailureSchema.safeParse(payload);
		const error = failure.success ? failure.data.error : undefined;
		throw new ChecksApiError(
			response.status,
			error?.code ?? "request_failed",
			error?.message ?? "The Checks sidecar rejected the request."
		);
	}
	return preserveChecksResponse(schema).parse(payload);
}
async function request<T>(
	schema: z.ZodType<T>,
	path: string,
	method: "DELETE" | "GET" | "PATCH" | "POST" = "GET",
	body?: ChecksAppRequestBody
): Promise<T> {
	const appRequest = bridge()?.app?.request;
	if (appRequest) {
		return preserveChecksResponse(schema).parse(
			await appRequest({ method, path, body })
		);
	}
	return directRequest(schema, path, method, body);
}

export async function loadRuntimeCatalog(): Promise<RyuCatalogSnapshot | null> {
	const catalog = bridge()?.catalog;
	if (!catalog?.snapshot) {
		return null;
	}
	try {
		return await catalog.snapshot();
	} catch {
		return null;
	}
}

export function discoverRuntimeModels(
	providerId: string
): Promise<RyuCatalogModels> {
	const models = bridge()?.catalog?.models;
	if (!models) {
		return Promise.reject(new Error("Ryu model discovery is unavailable."));
	}
	return models({ providerId });
}

export function getBootstrap(): Promise<BootstrapResponse> {
	return request(bootstrapResponseSchema, "/bootstrap");
}

export function getAnalytics(): Promise<Analytics> {
	return request(analyticsSchema, "/analytics");
}

export function createProject(input: {
	name: string;
	description: string;
	projectType: "UI" | "API" | "Mixed";
	url: string;
	testNames: string[];
	runtimeSelection?: RyuRuntimeSelection;
	contextSources?: ContextSource[];
}): Promise<{ project: Project; tests: TestCase[] }> {
	return request(projectCreationResponseSchema, "/projects", "POST", input);
}

export function exploreProject(projectId: string): Promise<ExplorationRecord> {
	return request(
		explorationRecordSchema,
		`/projects/${encodeURIComponent(projectId)}/explore`,
		"POST"
	);
}

export function updateTest(
	testId: string,
	input: {
		name?: string;
		description?: string;
		steps?: string[];
		assertions?: string[];
		priority?: "High" | "Medium" | "Low";
		requestMethod?: string;
		requestPath?: string;
		expectedStatus?: number;
		responseAssertions?: string[];
		maxResponseTimeMs?: number;
	}
): Promise<TestCase> {
	return request(
		testCaseSchema,
		`/tests/${encodeURIComponent(testId)}`,
		"PATCH",
		input
	);
}

export function updateList(
	listId: string,
	testIds: string[]
): Promise<TestList> {
	return request(
		testListSchema,
		`/lists/${encodeURIComponent(listId)}`,
		"PATCH",
		{
			testIds,
		}
	);
}

export function saveAgentRun(
	projectId: string,
	input: {
		agentId: string;
		status?: string;
		verdict?: string;
		evidenceLevel?: string;
		transcript: string;
		artifacts?: AgentRun["artifacts"];
	}
): Promise<AgentRun> {
	return request(
		agentRunSchema,
		`/projects/${encodeURIComponent(projectId)}/agent-runs`,
		"POST",
		input
	);
}

export function runProject(
	projectId: string,
	trigger = "manual"
): Promise<TestRun> {
	return request(
		testRunSchema,
		`/projects/${encodeURIComponent(projectId)}/runs`,
		"POST",
		{ trigger }
	);
}

export function runTest(testId: string, trigger = "manual"): Promise<TestRun> {
	return request(
		testRunSchema,
		`/tests/${encodeURIComponent(testId)}/run`,
		"POST",
		{
			trigger,
		}
	);
}

/** Fetch the retained screenshot and DOM snapshot for one evidence record. */
export function getEvidenceArtifacts(
	evidenceId: string
): Promise<EvidenceArtifacts> {
	return request(
		evidenceArtifactsSchema,
		`/evidence/${encodeURIComponent(evidenceId)}`
	);
}

export function healFailure(
	runId: string,
	failureId: string
): Promise<TestRun> {
	return request(
		testRunSchema,
		`/runs/${encodeURIComponent(runId)}/failures/${encodeURIComponent(failureId)}/heal`,
		"POST"
	);
}

export function runList(listId: string): Promise<{ runs: TestRun[] }> {
	return request(
		listRunsResponseSchema,
		`/lists/${encodeURIComponent(listId)}/runs`,
		"POST"
	);
}

export function createList(name: string): Promise<TestList> {
	return request(testListSchema, "/lists", "POST", { name });
}

export function createSchedule(input: {
	name: string;
	listId: string;
	frequency: string;
}): Promise<Schedule> {
	return request(scheduleSchema, "/schedules", "POST", input);
}

export function toggleSchedule(id: string, active: boolean): Promise<Schedule> {
	return request(
		scheduleSchema,
		`/schedules/${encodeURIComponent(id)}`,
		"PATCH",
		{
			active,
		}
	);
}

export function runSchedule(
	scheduleId: string
): Promise<{ schedule: Schedule; runs: TestRun[] }> {
	return request(
		scheduleRunResponseSchema,
		`/schedules/${encodeURIComponent(scheduleId)}/run`,
		"POST"
	);
}

export function deleteSchedule(id: string): Promise<{ deleted: boolean }> {
	return request(
		deletionResponseSchema,
		`/schedules/${encodeURIComponent(id)}`,
		"DELETE"
	);
}

export async function generatePlanWithModel(input: {
	name: string;
	url: string;
	brief: string;
	projectType: "UI" | "API" | "Mixed";
	runtimeSelection?: RyuRuntimeSelection;
}): Promise<string[]> {
	const model = bridge()?.model?.complete;
	if (!model) {
		throw new Error("Ryu model generation is unavailable.");
	}
	const runtime =
		input.runtimeSelection?.kind === "model"
			? {
					model: input.runtimeSelection.modelId,
					provider: input.runtimeSelection.providerId,
				}
			: {};
	const raw = await model({
		...runtime,
		prompt: [
			'Return JSON only: {"cases":[string,string,string,string]}.',
			"Create concise, user-observable end-to-end verification cases.",
			`Project: ${input.name}`,
			`Target: ${input.url}`,
			`Surface: ${input.projectType}`,
			`Product brief: ${input.brief}`,
		].join("\n"),
		system:
			"You are Ryu Checks' test-planning agent. Do not invent credentials or claim that a test ran. Return only valid JSON.",
	});
	const parsed = checksPlanSchema.safeParse(JSON.parse(raw));
	if (!parsed.success) {
		throw new Error("The model returned an invalid test plan.");
	}
	return parsed.data;
}

export async function runAgentLane(input: {
	project: Project;
	tests: TestCase[];
	agentId: string;
}): Promise<string> {
	const agent = bridge()?.agent?.run;
	if (!agent) {
		throw new Error("The selected Ryu agent lane is unavailable.");
	}
	return agent({
		agent_id: input.agentId,
		max_tokens: 1800,
		task: [
			"Run these verification cases against the target using the browser capability when available.",
			"Return a concise JSON report with verdict, evidenceLevel, passed, failed, and failures.",
			"Never claim a screenshot or DOM snapshot unless you actually captured it.",
			`Target: ${input.project.url}`,
			`Cases: ${input.tests.map((test) => `- ${test.name}`).join("\n")}`,
		].join("\n"),
	});
}
