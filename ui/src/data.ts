import type { RyuRuntimeSelection } from "@ryu/app-host/app-bridge";

export type TestType = "UI" | "API" | "MCP";
export type RunStatus = "passed" | "attention" | "running" | "idle" | "failed";
export type RunVerdict = "passed" | "attention";
export const CHECKS_EXECUTION_AVAILABLE = true;
export const CHECKS_PREVIEW_NOTICE =
	"Node-local runner · live HTTP evidence · optional Ryu agent lane";

export const PLANNING_CASES = [
	"Returning user signs in and reaches the dashboard",
	"New user signs up and reaches the dashboard",
	"Search returns an app detail page",
	"Checkout recovers from a billing error",
] as const;

export function selectedPlanningCases(selected: readonly boolean[]): string[] {
	return PLANNING_CASES.filter((_, index) => selected[index] === true);
}

export interface Project {
	attention: number;
	contextSources?: ContextSource[];
	coverage: number;
	createdAt?: string;
	description: string;
	id: string;
	lastRun: string;
	latestExplorationId?: string | null;
	latestRunId?: string | null;
	name: string;
	nextRun: string;
	passed: number;
	runtimeSelection?: RyuRuntimeSelection;
	status: RunStatus;
	tests: number;
	type: "UI" | "API" | "Mixed";
	updatedAt?: string;
	url: string;
}

export interface ContextSource {
	kind: string;
	label: string;
	value: string;
}

export interface TestCase {
	assertions?: string[];
	description: string;
	expectedStatus?: number;
	feature: string;
	id: string;
	latestRunId?: string | null;
	maxResponseTimeMs?: number | null;
	name: string;
	priority: "High" | "Medium" | "Low";
	projectId: string;
	requestMethod?: string;
	requestPath?: string | null;
	responseAssertions?: string[];
	source?: string;
	status: RunStatus;
	steps: string[];
	type: TestType;
	updated: string;
}

export interface EvidenceRecord {
	contentType?: string | null;
	domSnapshotAvailable: boolean;
	id: string;
	level: "live-http" | "agent-browser" | string;
	observedAt: string;
	responseTimeMs: number;
	screenshotAvailable: boolean;
	statusCode: number;
	testId: string;
	textPreview: string;
	title?: string | null;
	url: string;
}

export interface FailureBundle {
	domSnapshot?: string | null;
	evidenceId: string;
	failedStep: string;
	healedAt?: string | null;
	healingNote?: string | null;
	id: string;
	rootCause: string;
	screenshotAvailable: boolean;
	source: string;
	status?: "open" | "healed" | string;
	suggestedFix: string;
	testId: string;
	title: string;
}

export interface TestRun {
	coverage: number;
	durationMs: number;
	evidence: EvidenceRecord[];
	evidenceLevel: string;
	explorationId?: string | null;
	failed: number;
	failures: FailureBundle[];
	finishedAt: string;
	id: string;
	passed: number;
	projectId: string;
	scope?: "project" | "test" | string;
	skipped: number;
	startedAt: string;
	status: "pending" | "running" | "completed" | "failed" | "canceled";
	summary: string;
	targetTestId?: string | null;
	trigger: string;
	verdict: RunVerdict;
}

export interface AgentArtifact {
	available: boolean;
	kind: string;
	label: string;
	reference?: string | null;
}

export interface AgentRun {
	agentId: string;
	artifacts: AgentArtifact[];
	evidenceLevel: string;
	finishedAt: string;
	id: string;
	projectId: string;
	startedAt: string;
	status: string;
	transcript: string;
	verdict: string;
}

export interface FeatureArea {
	name: string;
	observed: boolean;
	signal: string;
}
export interface ExplorationRecord {
	coverage: number;
	evidenceLevel: string;
	featureAreas: FeatureArea[];
	finishedAt: string;
	id: string;
	pages: Array<{
		url: string;
		title?: string | null;
		statusCode: number;
		responseTimeMs: number;
		contentType?: string | null;
	}>;
	projectId: string;
	startedAt: string;
	status: "completed" | "failed" | string;
	target: string;
}
export interface TestList {
	apiTests: number;
	description: string;
	id: string;
	lastRun: string;
	name: string;
	nextRun: string;
	projectIds?: string[];
	status: RunStatus;
	testIds?: string[];
	uiTests: number;
}
export interface Schedule {
	active: boolean;
	createdAt?: string;
	frequency: string;
	id: string;
	lastResult: RunStatus;
	listId: string;
	listName: string;
	name: string;
	nextRun: string;
}
export interface Analytics {
	coverage: number;
	failed: number;
	failureBuckets: Array<{ name: string; count: number }>;
	passed: number;
	projects: number;
	runs: number;
	tests: number;
}
export interface BootstrapResponse {
	agentRuns: AgentRun[];
	explorations: ExplorationRecord[];
	lists: TestList[];
	projects: Project[];
	runs: TestRun[];
	schedules: Schedule[];
	tests: TestCase[];
}

export const initialProjects: Project[] = [
	{
		id: "storefront",
		name: "Ryu Storefront",
		description: "Customer journeys for the public Ryu marketplace.",
		type: "UI",
		url: "https://store.ryuhq.com",
		tests: 24,
		passed: 22,
		attention: 2,
		coverage: 91,
		status: "attention",
		lastRun: "12 minutes ago",
		nextRun: "Tonight, 11:30 PM",
	},
	{
		id: "gateway-api",
		name: "Gateway API",
		description: "Contract and auth workflows for the managed data plane.",
		type: "API",
		url: "https://api.ryuhq.com",
		tests: 38,
		passed: 38,
		attention: 0,
		coverage: 84,
		status: "passed",
		lastRun: "Yesterday",
		nextRun: "Tomorrow, 6:00 AM",
	},
	{
		id: "desktop-core",
		name: "Desktop Core Flows",
		description: "Workspace, chat, agent, and local file journeys.",
		type: "Mixed",
		url: "http://localhost:7980",
		tests: 19,
		passed: 17,
		attention: 2,
		coverage: 76,
		status: "attention",
		lastRun: "2 days ago",
		nextRun: "Friday, 8:00 AM",
	},
];

export const initialTests: TestCase[] = [
	{
		id: "storefront-sign-in",
		projectId: "storefront",
		name: "Returning user signs in and reaches the dashboard",
		description:
			"A returning user signs in successfully and lands on the dashboard workspace.",
		priority: "High",
		type: "UI",
		status: "passed",
		feature: "Authentication",
		steps: [
			"Open the sign-in page",
			"Submit the form",
			"Verify the dashboard workspace is visible",
		],
		updated: "12 minutes ago",
	},
	{
		id: "storefront-search",
		projectId: "storefront",
		name: "Search filters the marketplace without losing context",
		description:
			"A user searches for an app and can open the result while the query remains visible.",
		priority: "High",
		type: "UI",
		status: "passed",
		feature: "Marketplace search",
		steps: [
			"Open the marketplace",
			"Type a search term",
			"Open the first result",
		],
		updated: "12 minutes ago",
	},
	{
		id: "storefront-checkout",
		projectId: "storefront",
		name: "Checkout recovers from a billing error",
		description:
			"A recoverable billing error keeps the checkout flow actionable.",
		priority: "Medium",
		type: "UI",
		status: "attention",
		feature: "Checkout",
		steps: [
			"Open checkout",
			"Simulate the billing error",
			"Verify a recovery action",
		],
		updated: "12 minutes ago",
	},
	{
		id: "gateway-policy",
		projectId: "gateway-api",
		name: "Managed policy rejects an unapproved model",
		description:
			"The gateway refuses a model outside the organization's approved allowlist.",
		priority: "High",
		type: "API",
		status: "passed",
		feature: "Policy enforcement",
		steps: [
			"Resolve an organization token",
			"Request an unapproved model",
			"Verify rejection",
		],
		updated: "Yesterday",
	},
	{
		id: "gateway-debit",
		projectId: "gateway-api",
		name: "Usage debit is idempotent across a retried request",
		description:
			"A retried request does not double-charge the shared organization wallet.",
		priority: "Medium",
		type: "API",
		status: "passed",
		feature: "Usage accounting",
		steps: [
			"Submit a billable request",
			"Retry with the same reference",
			"Verify one debit",
		],
		updated: "Yesterday",
	},
];

export const initialLists: TestList[] = [
	{
		id: "release-gate",
		name: "Release gate",
		description: "The short suite that must stay green before a release.",
		status: "passed",
		uiTests: 8,
		apiTests: 12,
		lastRun: "12 minutes ago",
		nextRun: "Tonight, 11:30 PM",
	},
];
export const initialSchedules: Schedule[] = [
	{
		id: "release-gate-schedule",
		name: "Release gate · every merge",
		listName: "Release gate",
		frequency: "On every merge",
		nextRun: "When a PR changes",
		lastResult: "passed",
		active: true,
		listId: "release-gate",
	},
];

export function testsForProject(
	projectId: string,
	tests = initialTests
): TestCase[] {
	return tests.filter((test) => test.projectId === projectId);
}
export function projectStatusLabel(status: RunStatus): string {
	if (status === "passed") {
		return "Passed";
	}
	if (status === "attention") {
		return "Needs attention";
	}
	if (status === "running") {
		return "Running";
	}
	return "Ready to run";
}
export function projectStatusClass(status: RunStatus): string {
	if (status === "passed") {
		return "status-pass";
	}
	if (status === "attention") {
		return "status-attention";
	}
	if (status === "running") {
		return "status-running";
	}
	return "status-idle";
}
export function typeClass(type: TestType | Project["type"]): string {
	return `type-${type.toLowerCase()}`;
}
export function filteredProjects(
	projects: Project[],
	query: string,
	filter: "All" | "UI" | "API"
): Project[] {
	const normalizedQuery = query.trim().toLowerCase();
	return projects.filter((project) => {
		const matchesType =
			filter === "All" || project.type === filter || project.type === "Mixed";
		const matchesQuery =
			normalizedQuery.length === 0 ||
			`${project.name} ${project.description} ${project.url}`
				.toLowerCase()
				.includes(normalizedQuery);
		return matchesType && matchesQuery;
	});
}
export function overallCoverage(projects: Project[]): number {
	return projects.length === 0
		? 0
		: Math.round(
				projects.reduce((total, project) => total + project.coverage, 0) /
					projects.length
			);
}
export function runForProject(
	projectId: string,
	runs: TestRun[]
): TestRun | undefined {
	return runs.find((run) => run.projectId === projectId);
}
export function explorationForProject(
	projectId: string,
	explorations: ExplorationRecord[]
): ExplorationRecord | undefined {
	return explorations.find(
		(exploration) => exploration.projectId === projectId
	);
}
