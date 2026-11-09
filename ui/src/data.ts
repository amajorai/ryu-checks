import type { z } from "zod";
import type {
	agentArtifactSchema,
	agentRunSchema,
	analyticsSchema,
	bootstrapResponseSchema,
	contextSourceSchema,
	evidenceArtifactsSchema,
	evidenceRecordSchema,
	explorationRecordSchema,
	failureBundleSchema,
	featureAreaSchema,
	projectSchema,
	scheduleSchema,
	testCaseSchema,
	testListSchema,
	testRunSchema,
} from "./schemas.ts";

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

export type Project = z.output<typeof projectSchema>;

export type ContextSource = z.output<typeof contextSourceSchema>;

export type TestCase = z.output<typeof testCaseSchema>;

export type EvidenceRecord = z.output<typeof evidenceRecordSchema>;

export type EvidenceArtifacts = z.output<typeof evidenceArtifactsSchema>;

export type FailureBundle = z.output<typeof failureBundleSchema>;

export type TestRun = z.output<typeof testRunSchema>;

export type AgentArtifact = z.output<typeof agentArtifactSchema>;

export type AgentRun = z.output<typeof agentRunSchema>;

export type FeatureArea = z.output<typeof featureAreaSchema>;
export type ExplorationRecord = z.output<typeof explorationRecordSchema>;
export type TestList = z.output<typeof testListSchema>;
export type Schedule = z.output<typeof scheduleSchema>;
export type Analytics = z.output<typeof analyticsSchema>;
export type BootstrapResponse = z.output<typeof bootstrapResponseSchema>;

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
	if (status === "failed") {
		return "Failed";
	}
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
	if (status === "attention" || status === "failed") {
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
