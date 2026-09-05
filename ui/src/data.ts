import type { RyuRuntimeSelection } from "@ryu/app-host/app-bridge";

export type TestType = "UI" | "API" | "MCP";
export type RunStatus = "passed" | "attention" | "running" | "idle";

/** Tests is currently a planning preview; no execution service is connected. */
export const CHECKS_EXECUTION_AVAILABLE = false;
export const CHECKS_PREVIEW_NOTICE =
	"Planning preview only — test execution, scheduling, persistence, and external integrations are not connected in this build.";

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
	coverage: number;
	description: string;
	id: string;
	lastRun: string;
	name: string;
	nextRun: string;
	passed: number;
	runtimeSelection?: RyuRuntimeSelection;
	status: RunStatus;
	tests: number;
	type: "UI" | "API" | "Mixed";
	url: string;
}

export interface TestCase {
	description: string;
	feature: string;
	id: string;
	name: string;
	priority: "High" | "Medium" | "Low";
	projectId: string;
	status: RunStatus;
	steps: string[];
	type: TestType;
	updated: string;
}

export interface TestList {
	apiTests: number;
	description: string;
	id: string;
	lastRun: string;
	name: string;
	nextRun: string;
	status: RunStatus;
	uiTests: number;
}

export interface Schedule {
	active: boolean;
	frequency: string;
	id: string;
	lastResult: RunStatus;
	listName: string;
	name: string;
	nextRun: string;
}

/** Fixture-only sample data for deterministic data-helper tests. The runtime does not seed it. */
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
			"Enter a valid workspace email and password",
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
			"Verify matching apps are shown",
			"Open the first result",
		],
		updated: "12 minutes ago",
	},
	{
		id: "storefront-checkout",
		projectId: "storefront",
		name: "Checkout shows a useful error when billing is unavailable",
		description:
			"The checkout flow surfaces a recoverable error instead of leaving the user on a blank state.",
		priority: "Medium",
		type: "UI",
		status: "attention",
		feature: "Billing",
		steps: [
			"Add a paid app to the cart",
			"Continue to checkout",
			"Simulate an unavailable billing provider",
			"Verify a recovery action is offered",
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
			"Request a model outside the allowlist",
			"Verify the request is rejected before dispatch",
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
			"Retry with the same reference id",
			"Verify the wallet has one debit",
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
	{
		id: "nightly-regression",
		name: "Nightly regression",
		description: "Full coverage across the storefront and Gateway API.",
		status: "attention",
		uiTests: 18,
		apiTests: 26,
		lastRun: "Yesterday",
		nextRun: "Tonight, 2:00 AM",
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
	},
	{
		id: "nightly-schedule",
		name: "Nightly regression",
		listName: "Nightly regression",
		frequency: "Every night at 2:00 AM",
		nextRun: "Tonight, 2:00 AM",
		lastResult: "attention",
		active: true,
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
	return "Not run";
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
	if (projects.length === 0) {
		return 0;
	}
	return Math.round(
		projects.reduce((total, project) => total + project.coverage, 0) /
			projects.length
	);
}
