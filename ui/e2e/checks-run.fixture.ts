import type { Page } from "@playwright/test";
import type {
	BootstrapResponse,
	Project,
	TestCase,
	TestRun,
} from "../src/data.ts";
import type { ChecksAppRequestBody } from "../src/schemas.ts";
import { checksFixtureBundle } from "./fixture-bundle.ts";
// Brings the `window.__checksFixtureSchemas` declaration into this program.
import type {} from "./fixture-schemas.ts";

export interface RunFixtureCall {
	body?: ChecksAppRequestBody;
	method: string;
	path: string;
}

export interface RunFixture {
	calls: RunFixtureCall[];
	executions: number;
	state: BootstrapResponse;
	unknownRequests: RunFixtureCall[];
}

interface RunFixtureInitArgs {
	initial: BootstrapResponse;
	result: TestRun;
	scope: "project" | "test";
}

declare global {
	interface Window {
		__checksRunFixture?: RunFixture;
	}
}

type InitScriptPage = Pick<Page, "addInitScript">;

export const runProjectA: Project = {
	id: "run-project-a",
	name: "Checkout verification",
	description: "Checkout response checks.",
	type: "API",
	url: "https://checks-fixture.test/checkout",
	tests: 1,
	passed: 0,
	attention: 0,
	coverage: 0,
	status: "idle",
	lastRun: "Never",
	nextRun: "Not scheduled",
};
export const runProjectB: Project = {
	...runProjectA,
	id: "run-project-b",
	name: "Catalog verification",
	url: "https://checks-fixture.test/catalog",
	passed: 1,
	coverage: 75,
	status: "passed",
	lastRun: "Yesterday",
	latestRunId: "catalog-existing-run",
};
const selectedCase: TestCase = {
	id: "checkout-response",
	projectId: runProjectA.id,
	name: "Checkout returns a receipt",
	description: "Verify the checkout response.",
	feature: "Checkout",
	priority: "High",
	type: "API",
	status: "idle",
	steps: ["Request checkout", "Verify receipt"],
	updated: "Today",
};
export const successfulRun: TestRun = {
	id: "checkout-confirmed-run",
	projectId: runProjectA.id,
	scope: "project",
	coverage: 100,
	durationMs: 25,
	evidenceLevel: "live-http",
	failed: 0,
	failures: [],
	finishedAt: "2026-10-05T02:00:00Z",
	startedAt: "2026-10-05T01:59:59Z",
	passed: 1,
	skipped: 0,
	status: "completed",
	summary: "Checkout receipt verified",
	trigger: "manual",
	verdict: "passed",
	evidence: [
		{
			id: "checkout-evidence",
			testId: selectedCase.id,
			level: "live-http",
			observedAt: "2026-10-05T02:00:00Z",
			responseTimeMs: 25,
			statusCode: 200,
			textPreview: "receipt: confirmed-checkout",
			title: "Checkout receipt",
			url: runProjectA.url,
			domSnapshotAvailable: false,
			screenshotAvailable: false,
		},
	],
};
export const catalogRun: TestRun = {
	...successfulRun,
	id: "catalog-existing-run",
	projectId: runProjectB.id,
	coverage: 75,
	summary: "Catalog response retained",
	evidence: [],
};

export async function installRunFixture(
	page: InitScriptPage,
	scope: "project" | "test"
) {
	const initial: BootstrapResponse = {
		agentRuns: [],
		explorations: [],
		lists: [],
		projects: [runProjectA, runProjectB],
		runs: [catalogRun],
		schedules: [],
		tests: [selectedCase],
	};
	await page.addInitScript({ content: checksFixtureBundle() });
	await page.addInitScript(
		({ initial, result, scope }: RunFixtureInitArgs) => {
			const key = `checks-run-proof-${scope}`;
			const saved = localStorage.getItem(key);
			const schemas = window.__checksFixtureSchemas;
			if (!schemas) {
				throw new Error("Native Checks fixture codecs missing");
			}
			const fixture: RunFixture = saved
				? schemas.run(JSON.parse(saved))
				: {
						calls: [],
						executions: 0,
						state: structuredClone(initial),
						unknownRequests: [],
					};
			window.__checksRunFixture = fixture;
			const persist = () => localStorage.setItem(key, JSON.stringify(fixture));
			window.ryu = {
				context: null,
				app: {
					request: async ({ method: requestedMethod, path, body }) => {
						const method = requestedMethod ?? "GET";
						const call: RunFixtureCall = { method, path };
						if (body !== undefined) {
							call.body = structuredClone(body);
						}
						fixture.calls.push(call);
						persist();
						if (method === "GET" && path === "/bootstrap") {
							return structuredClone(fixture.state);
						}
						if (method === "GET" && path === "/analytics") {
							return {
								coverage: 75,
								failed: 0,
								failureBuckets: [],
								passed: 1,
								projects: fixture.state.projects.length,
								runs: fixture.state.runs.length,
								tests: fixture.state.tests.length,
							};
						}
						const runPath =
							scope === "project"
								? "/projects/run-project-a/runs"
								: "/tests/checkout-response/run";
						if (
							method === "POST" &&
							path === runPath &&
							JSON.stringify(body) === '{"trigger":"manual"}'
						) {
							const attempts = fixture.calls.filter(
								(item) => item.method === "POST" && item.path === runPath
							).length;
							if (attempts === 1) {
								throw new Error(
									"Permission denied: checkout run was not executed."
								);
							}
							if (attempts !== 2) {
								throw new Error(
									"Unexpected repeated execution after confirmed checkout run."
								);
							}
							const run: TestRun = { ...result, scope };
							if (scope === "test") {
								run.targetTestId = "checkout-response";
							}
							fixture.executions += 1;
							fixture.state.runs.unshift(run);
							fixture.state.projects = fixture.state.projects.map((project) => {
								if (project.id !== run.projectId) {
									return project;
								}
								const updated: Project = {
									...project,
									lastRun: "Just now",
									latestRunId: run.id,
								};
								if (scope === "project") {
									updated.status = "passed";
									updated.passed = 1;
									updated.attention = 0;
									updated.coverage = 100;
								}
								return updated;
							});
							persist();
							return structuredClone(run);
						}
						fixture.unknownRequests.push(call);
						persist();
						throw new Error(
							`Unexpected run fixture request: ${method} ${path}`
						);
					},
				},
			};
		},
		{ initial, result: successfulRun, scope }
	);
}
