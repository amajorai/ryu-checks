import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import type { BootstrapResponse, Project, TestCase } from "../src/data.ts";
import type { ChecksAppRequestBody } from "../src/schemas.ts";
import {
	catalogRun,
	installRunFixture,
	runProjectA,
	runProjectB,
	successfulRun,
} from "./checks-run.fixture.ts";
import { checksFixtureBundle } from "./fixture-bundle.ts";

interface FixtureCall {
	body?: ChecksAppRequestBody;
	method: string;
	path: string;
}

interface ChecksFixture {
	calls: FixtureCall[];
	externalNavigations: string[];
	state: BootstrapResponse;
	unknownRequests: FixtureCall[];
}

declare global {
	interface Window {
		__checksInteractionFixture?: ChecksFixture;
	}
}

const EVIDENCE_DIRECTORY = path.resolve(import.meta.dirname, "evidence");

async function selectProjectHistory(page: Page) {
	const history = page.getByRole("tab", { name: "Run History", exact: true });
	if (await history.isVisible()) {
		await history.click();
	} else {
		await page
			.getByRole("button", { name: /^Show (?:\d+ )?more tabs$/ })
			.click();
		const option = page.getByRole("option", { name: /Run History/ });
		await option
			.getByText("Run History", { exact: true })
			.waitFor({ state: "visible" });
		await option.click();
		await option.waitFor({ state: "hidden" });
	}
	await history.waitFor({ state: "visible" });
	return history;
}

for (const scope of ["project", "test"] as const) {
	test(`denied ${scope} run retries once and retains only the selected project's evidence`, async ({
		page,
	}) => {
		const pageErrors: string[] = [];
		page.on("pageerror", (error) => pageErrors.push(error.message));
		await page.setViewportSize({ width: 1440, height: 1100 });
		await installRunFixture(page, scope);
		await page.goto("/?screen=all-tests");
		await page
			.locator(".project-card")
			.filter({ hasText: runProjectA.name })
			.getByRole("button", { name: "Open project" })
			.click();
		if (scope === "test") {
			await page.getByRole("tab", { name: "Endpoint Tests" }).click();
			await page
				.getByRole("option", { name: /Checkout returns a receipt/ })
				.click();
		}
		const control = page.getByRole("button", {
			name: scope === "project" ? "Run project" : "Run case",
			exact: true,
		});
		await control.click();
		await expect(page.locator(".toast")).toContainText(
			"Permission denied: checkout run was not executed."
		);
		if (scope === "project") {
			await expect(
				page.locator('.project-snapshot [data-status="attention"]').first()
			).toBeVisible();
			await expect(page.locator(".project-snapshot")).toContainText(
				"0 passed · 0 attention"
			);
		}
		const denied = await page.evaluate(() => window.__checksRunFixture);
		expect(denied?.executions).toBe(0);
		expect(denied?.state.runs).toEqual([catalogRun]);
		expect(denied?.state.projects).toEqual([runProjectA, runProjectB]);
		expect(denied?.calls.filter((call) => call.method === "POST")).toEqual([
			{
				method: "POST",
				path:
					scope === "project"
						? "/projects/run-project-a/runs"
						: "/tests/checkout-response/run",
				body: { trigger: "manual" },
			},
		]);
		await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
		await page.screenshot({
			animations: "disabled",
			fullPage: true,
			path: path.join(EVIDENCE_DIRECTORY, `checks-${scope}-run-denied.png`),
		});
		await control.click();
		await expect(page.locator(".toast")).toContainText(
			scope === "project"
				? "Checkout verification passed with live evidence."
				: "The case passed with live evidence."
		);
		if (scope === "test") {
			await expect(page.locator(".terminal-output")).toContainText(
				"receipt: confirmed-checkout"
			);
			await expect(page.locator(".terminal-output")).toContainText(
				"200 Checkout receipt"
			);
			await page
				.getByRole("button", { name: runProjectA.name, exact: true })
				.click();
		}
		await expect(page.locator(".project-snapshot")).toContainText(
			scope === "project" ? "1 passed · 0 attention" : "0 passed · 0 attention"
		);
		await expect(page.locator(".project-snapshot")).toContainText("live-http");
		await expect(await selectProjectHistory(page)).toHaveAttribute(
			"aria-selected",
			"true"
		);
		await expect(
			page.getByText(
				`1 run kept for ${runProjectA.name}; verdicts are never overwritten.`
			)
		).toBeVisible();
		await expect(
			page.locator(".run-history-table .test-table-row")
		).toHaveCount(1);
		await expect(page.locator(".run-history-table")).toContainText(
			"live-http · 1/1"
		);
		await page.getByRole("button", { name: "All Tests", exact: true }).click();
		await page
			.locator(".project-card")
			.filter({ hasText: runProjectB.name })
			.getByRole("button", { name: "Open project" })
			.click();
		await expect(page.locator(".project-snapshot")).toContainText("75%");
		await expect(await selectProjectHistory(page)).toHaveAttribute(
			"aria-selected",
			"true"
		);
		await expect(
			page.locator(".run-history-table .test-table-row")
		).toHaveCount(1);
		await expect(page.locator(".run-history-table")).toContainText("75%");
		await page.reload();
		await page
			.locator(".project-card")
			.filter({ hasText: runProjectA.name })
			.getByRole("button", { name: "Open project" })
			.click();
		await expect(await selectProjectHistory(page)).toHaveAttribute(
			"aria-selected",
			"true"
		);
		await expect(
			page.locator(".run-history-table .test-table-row")
		).toHaveCount(1);
		await expect(page.locator(".run-history-table")).toContainText(
			"live-http · 1/1"
		);
		const confirmed = await page.evaluate(() => window.__checksRunFixture);
		expect(confirmed?.executions).toBe(1);
		expect(confirmed?.unknownRequests).toEqual([]);
		expect(confirmed?.calls.filter((call) => call.method === "POST")).toEqual(
			[0, 1].map(() => ({
				method: "POST",
				path:
					scope === "project"
						? "/projects/run-project-a/runs"
						: "/tests/checkout-response/run",
				body: { trigger: "manual" },
			}))
		);
		expect(
			confirmed?.calls
				.filter((call) => call.method !== "POST")
				.every(
					(call) =>
						call.method === "GET" &&
						["/bootstrap", "/analytics"].includes(call.path)
				)
		).toBe(true);
		const expectedRun: typeof successfulRun = { ...successfulRun, scope };
		if (scope === "test") {
			expectedRun.targetTestId = "checkout-response";
		}
		expect(confirmed?.state.runs).toEqual([expectedRun, catalogRun]);
		expect(
			confirmed?.state.projects.find((item) => item.id === runProjectB.id)
		).toEqual(runProjectB);
		expect(pageErrors).toEqual([]);
		await page.screenshot({
			animations: "disabled",
			fullPage: true,
			path: path.join(
				EVIDENCE_DIRECTORY,
				`checks-${scope}-run-retry-persisted-history.png`
			),
		});
	});
}

const project: Project = {
	id: "interaction-project",
	name: "Checks interaction fixture",
	description: "A local fixture for Companion interaction regression tests.",
	type: "UI",
	url: "https://checks-fixture.test",
	tests: 1,
	passed: 0,
	attention: 0,
	coverage: 0,
	status: "idle",
	lastRun: "Never",
	nextRun: "Not scheduled",
};

const testCase: TestCase = {
	id: "interaction-test-case",
	projectId: project.id,
	name: "Returning user reaches the dashboard",
	description: "Sign in as an existing user and verify the dashboard loads.",
	feature: "Sign in",
	priority: "High",
	type: "UI",
	status: "idle",
	steps: [
		"Open the sign-in page",
		"Submit valid credentials",
		"Verify dashboard",
	],
	updated: "Today",
};

const initialState: BootstrapResponse = {
	agentRuns: [],
	explorations: [],
	lists: [],
	projects: [project],
	runs: [],
	schedules: [],
	tests: [testCase],
};

async function installFixture(page: Page, apiPlan = false, saveFailures = 0) {
	await page.addInitScript({ content: checksFixtureBundle() });
	await page.addInitScript(
		({ initial, apiPlan, saveFailures }) => {
			let remainingSaveFailures = saveFailures;
			const schemas = window.__checksFixtureSchemas;
			if (!schemas) {
				throw new Error("Native Checks fixture codecs missing");
			}
			const fixture: ChecksFixture = {
				calls: [],
				externalNavigations: [],
				state: structuredClone(initial),
				unknownRequests: [],
			};
			if (apiPlan) {
				const test = fixture.state.tests[0];
				const project = fixture.state.projects[0];
				if (!(test && project)) {
					throw new Error(
						"Checks API plan fixture requires its initial test and project"
					);
				}
				test.type = "API";
				project.type = "API";
			}
			window.__checksInteractionFixture = fixture;
			window.ryu = {
				context: null,
				app: {
					request: async ({ method: requestedMethod, path, body }) => {
						const method = requestedMethod ?? "GET";
						const call: Omit<FixtureCall, "method" | "path"> = {};
						if (body !== undefined) {
							call.body = structuredClone(body);
						}
						fixture.calls.push({ ...call, method, path });
						if (method === "GET" && path === "/bootstrap") {
							return structuredClone(fixture.state);
						}
						if (method === "GET" && path === "/analytics") {
							return {
								coverage: 0,
								failed: 0,
								failureBuckets: [],
								passed: 0,
								projects: fixture.state.projects.length,
								runs: 0,
								tests: fixture.state.tests.length,
							};
						}
						if (
							apiPlan &&
							method === "PATCH" &&
							path === "/tests/interaction-test-case"
						) {
							if (remainingSaveFailures > 0) {
								remainingSaveFailures -= 1;
								throw new Error("Permission denied: test plan was not saved.");
							}
							const current = fixture.state.tests[0];
							if (!current) {
								throw new Error("Checks plan save fixture has no current test");
							}
							const updated: TestCase = {
								...current,
								...schemas.testUpdate(body),
								updated: "Just now",
							};
							fixture.state.tests[0] = updated;
							return structuredClone(updated);
						}
						fixture.unknownRequests.push({ method, path, body });
						throw new Error(
							`Unexpected Checks fixture request: ${method} ${path}`
						);
					},
				},
				ui: {
					openExternal: async ({ href }: { href: string }) => {
						fixture.externalNavigations.push(href);
					},
				},
			};
		},
		{ initial: initialState, apiPlan, saveFailures }
	);
}

async function openTestChat(page: Page) {
	await installFixture(page);
	await page.goto("/?screen=all-tests");
	await page.getByRole("button", { name: "Open project" }).click();
	await page.getByRole("tab", { name: "Web Tests" }).click();
	await page
		.getByRole("option", { name: /Returning user reaches the dashboard/ })
		.click();
	await expect(
		page.getByRole("heading", { name: "Returning user reaches the dashboard" })
	).toBeVisible();
	await page.getByRole("tab", { name: /^Chat/ }).click();
	const caseWorkspace = await page.locator(".case-workspace").boundingBox();
	expect(caseWorkspace?.width ?? 0).toBeGreaterThan(900);
}

async function fixtureCalls(page: Page): Promise<FixtureCall[]> {
	return page.evaluate(() => window.__checksInteractionFixture?.calls ?? []);
}

test("Help shows the node-local evidence explanation without issuing a request", async ({
	page,
}) => {
	await installFixture(page);
	await page.goto("/?screen=all-tests");
	await expect(page.getByRole("heading", { name: "All Tests" })).toBeVisible();
	const callsBeforeHelp = await fixtureCalls(page);

	await page.getByRole("button", { name: "Help", exact: true }).click();
	await expect(page.locator(".toast[aria-live='polite']")).toHaveText(
		"Checks stores live evidence in the node-local sidecar."
	);
	expect(await fixtureCalls(page)).toEqual(callsBeforeHelp);

	await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
	await page.screenshot({
		animations: "disabled",
		fullPage: true,
		path: path.join(EVIDENCE_DIRECTORY, "checks-help-toast.png"),
	});
});

test("Project test list does not expose the unsupported add-from-plan action", async ({
	page,
}) => {
	await installFixture(page);
	await page.goto("/?screen=all-tests");
	await page.getByRole("button", { name: "Open project" }).click();
	await page.getByRole("tab", { name: "Web Tests" }).click();
	await expect(page.getByRole("heading", { name: "Web tests" })).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Add test from plan" })
	).toHaveCount(0);
	await expect(
		page.getByRole("option", { name: /Returning user reaches the dashboard/ })
	).toBeVisible();

	await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
	await page.screenshot({
		animations: "disabled",
		fullPage: true,
		path: path.join(
			EVIDENCE_DIRECTORY,
			"checks-project-cases-no-dead-add-action.png"
		),
	});
});

test("Agent refinement explains its limit and leaves manual plan editing available", async ({
	page,
}) => {
	await openTestChat(page);
	await expect(
		page.getByText(
			"Agent-assisted refinement isn't available here yet. Use Edit plan to update this case."
		)
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Suggest refinement" })
	).toHaveCount(0);
	await expect(page.getByPlaceholder("Describe a refinement…")).toHaveCount(0);
	expect(
		(await fixtureCalls(page)).every(({ method }) => method === "GET")
	).toBe(true);

	await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
	await page.screenshot({
		animations: "disabled",
		fullPage: true,
		path: path.join(
			EVIDENCE_DIRECTORY,
			"checks-agent-refinement-capability-boundary.png"
		),
	});

	await page.getByRole("tab", { name: "Overview" }).click();
	await page.getByRole("button", { name: "Edit plan" }).click();
	await expect(page.getByRole("textbox", { name: "Description" })).toHaveValue(
		testCase.description
	);
	await expect(page.getByRole("button", { name: "Save plan" })).toBeVisible();
});

test("View CI setup opens the supported Checks guide without configuring GitHub", async ({
	page,
}) => {
	await installFixture(page);
	await page.goto("/?screen=settings-github");
	await expect(
		page.getByRole("option", { name: /GitHub App PR verification/ })
	).toHaveAttribute("aria-selected", "true");
	await expect(
		page.getByRole("heading", { name: "External integration" })
	).toBeVisible();
	await expect(
		page.getByText(
			"GitHub authorization and workflow editing stay outside Checks. The CI guide covers the supported node-local CLI and authenticated Checks-tool paths."
		)
	).toBeVisible();
	const ciGuide = "https://docs.ryuhq.com/docs/apps/checks#cli-ci-and-mcp";
	const viewCiSetup = page.getByRole("button", { name: "View CI setup" });
	await expect(viewCiSetup).toBeEnabled();
	await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
	await page.screenshot({
		animations: "disabled",
		fullPage: true,
		path: path.join(EVIDENCE_DIRECTORY, "checks-github-ci-boundary.png"),
	});
	await viewCiSetup.click();
	await expect
		.poll(() =>
			page.evaluate(
				() => window.__checksInteractionFixture?.externalNavigations ?? []
			)
		)
		.toEqual([ciGuide]);
	expect(
		(await fixtureCalls(page)).every(({ method }) => method === "GET")
	).toBe(true);
});

test("API plan saves exact assertions and timing and reopening reads the saved response", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 1440 });
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => pageErrors.push(error.message));
	await installFixture(page, true);
	await page.goto("/?screen=all-tests");
	await page.getByRole("button", { name: "Open project" }).click();
	await page.getByRole("tab", { name: "Endpoint Tests" }).click();
	await page
		.getByRole("option", { name: /Returning user reaches the dashboard/ })
		.click();
	await page.getByRole("button", { name: "Edit plan" }).click();
	await page
		.getByRole("textbox", { name: "Description", exact: true })
		.fill("Created orders return a stable order ID.");
	await page
		.getByRole("textbox", { name: "HTTP method", exact: true })
		.fill("POST");
	await page
		.getByRole("textbox", { name: "Request path", exact: true })
		.fill("/api/orders");
	await page
		.getByRole("spinbutton", { name: "Expected status", exact: true })
		.fill("201");
	await page
		.getByRole("spinbutton", {
			name: "Max response time · optional ms",
			exact: true,
		})
		.fill("1250");
	await page
		.getByRole("textbox", {
			name: "Response assertions · one per line",
			exact: true,
		})
		.fill("contains:order_id\ncontains:created");
	await page
		.getByRole("textbox", { name: "Steps · one per line", exact: true })
		.fill("Submit an order\nCheck the returned identifier");
	await page.getByRole("button", { name: "Save plan" }).click();
	await expect(page.locator(".toast[aria-live='polite']")).toHaveText(
		"Test plan saved. Run it to attach fresh evidence."
	);
	await expect(page.getByRole("button", { name: "Save plan" })).toHaveCount(0);
	const expected = {
		description: "Created orders return a stable order ID.",
		expectedStatus: 201,
		requestMethod: "POST",
		requestPath: "/api/orders",
		responseAssertions: ["contains:order_id", "contains:created"],
		maxResponseTimeMs: 1250,
		steps: ["Submit an order", "Check the returned identifier"],
	};
	expect(
		(await fixtureCalls(page)).filter(({ method }) => method !== "GET")
	).toEqual([
		{ method: "PATCH", path: "/tests/interaction-test-case", body: expected },
	]);
	await page.getByRole("button", { name: "Edit plan" }).click();
	await expect(
		page.getByRole("textbox", { name: "Description", exact: true })
	).toHaveValue(expected.description);
	await expect(
		page.getByRole("textbox", { name: "HTTP method", exact: true })
	).toHaveValue(expected.requestMethod);
	await expect(
		page.getByRole("textbox", { name: "Request path", exact: true })
	).toHaveValue(expected.requestPath);
	await expect(
		page.getByRole("spinbutton", { name: "Expected status", exact: true })
	).toHaveValue("201");
	await expect(
		page.getByRole("spinbutton", {
			name: "Max response time · optional ms",
			exact: true,
		})
	).toHaveValue("1250");
	await expect(
		page.getByRole("textbox", {
			name: "Response assertions · one per line",
			exact: true,
		})
	).toHaveValue(expected.responseAssertions.join("\n"));
	await expect(
		page.getByRole("textbox", { name: "Steps · one per line", exact: true })
	).toHaveValue(expected.steps.join("\n"));
	const persisted = await page.evaluate(
		() => window.__checksInteractionFixture?.state.tests[0]
	);
	expect(persisted).toMatchObject({ ...expected, status: "idle" });
	expect(
		await page.evaluate(() => window.__checksInteractionFixture?.state.runs)
	).toEqual([]);
	expect(
		await page.evaluate(
			() => window.__checksInteractionFixture?.unknownRequests
		)
	).toEqual([]);
	expect(pageErrors).toEqual([]);
	const fields = page.locator(
		".case-edit-form input, .case-edit-form textarea"
	);
	await expect(fields).toHaveCount(7);
	for (const field of await fields.all()) {
		const bounds = await field.boundingBox();
		expect(bounds).not.toBeNull();
		if (!bounds) {
			throw new Error("Saved API plan field has no rendered bounds");
		}
		expect(bounds.x).toBeGreaterThanOrEqual(0);
		expect(bounds.y).toBeGreaterThanOrEqual(0);
		expect(bounds.x + bounds.width).toBeLessThanOrEqual(1440);
		expect(bounds.y + bounds.height).toBeLessThanOrEqual(1440);
	}
	await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
	await page.screenshot({
		animations: "disabled",
		fullPage: true,
		path: path.join(EVIDENCE_DIRECTORY, "checks-api-plan-saved-readback.png"),
	});
});

test("denied plan save retains the draft and explicit retry saves the same exact plan", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 1440 });
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => pageErrors.push(error.message));
	await installFixture(page, true, 1);
	await page.goto("/?screen=all-tests");
	await page.getByRole("button", { name: "Open project" }).click();
	await page.getByRole("tab", { name: "Endpoint Tests" }).click();
	await page
		.getByRole("option", { name: /Returning user reaches the dashboard/ })
		.click();
	await page.getByRole("button", { name: "Edit plan" }).click();
	const description =
		"Denied requests preserve the unsaved acceptance criteria.";
	await page
		.getByRole("textbox", { name: "Description", exact: true })
		.fill(description);
	await page
		.getByRole("textbox", { name: "Request path", exact: true })
		.fill("/api/health");
	await page
		.getByRole("textbox", {
			name: "Response assertions · one per line",
			exact: true,
		})
		.fill("contains:healthy");
	await page.getByRole("button", { name: "Save plan" }).click();
	await expect(page.locator(".toast[aria-live='polite']")).toHaveText(
		"Permission denied: test plan was not saved."
	);
	await expect(page.getByRole("button", { name: "Save plan" })).toBeEnabled();
	await expect(
		page.getByRole("textbox", { name: "Description", exact: true })
	).toHaveValue(description);
	await expect(
		page.getByRole("textbox", { name: "Request path", exact: true })
	).toHaveValue("/api/health");
	await expect(
		page.getByRole("textbox", {
			name: "Response assertions · one per line",
			exact: true,
		})
	).toHaveValue("contains:healthy");
	const expected = {
		description,
		expectedStatus: 200,
		requestMethod: "GET",
		requestPath: "/api/health",
		responseAssertions: ["contains:healthy"],
		steps: testCase.steps,
	};
	const request = {
		method: "PATCH",
		path: "/tests/interaction-test-case",
		body: expected,
	};
	expect(
		(await fixtureCalls(page)).filter(({ method }) => method !== "GET")
	).toEqual([request]);
	expect(
		await page.evaluate(() => window.__checksInteractionFixture?.state.tests[0])
	).toMatchObject({ description: testCase.description, status: "idle" });
	expect(
		await page.evaluate(() => window.__checksInteractionFixture?.state.runs)
	).toEqual([]);
	await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
	await page.screenshot({
		animations: "disabled",
		fullPage: true,
		path: path.join(
			EVIDENCE_DIRECTORY,
			"checks-denied-plan-retained-draft.png"
		),
	});
	expect(pageErrors).toEqual([]);
	await page.getByRole("button", { name: "Save plan" }).click();
	await expect(page.locator(".toast[aria-live='polite']")).toHaveText(
		"Test plan saved. Run it to attach fresh evidence."
	);
	await expect(page.getByRole("button", { name: "Save plan" })).toHaveCount(0);
	expect(
		(await fixtureCalls(page)).filter(({ method }) => method !== "GET")
	).toEqual([request, request]);
	await page.getByRole("button", { name: "Edit plan" }).click();
	await expect(
		page.getByRole("textbox", { name: "Description", exact: true })
	).toHaveValue(description);
	await expect(
		page.getByRole("textbox", { name: "Request path", exact: true })
	).toHaveValue("/api/health");
	await expect(
		page.getByRole("textbox", {
			name: "Response assertions · one per line",
			exact: true,
		})
	).toHaveValue("contains:healthy");
	expect(
		await page.evaluate(() => window.__checksInteractionFixture?.state.tests[0])
	).toMatchObject(expected);
	expect(
		await page.evaluate(
			() => window.__checksInteractionFixture?.unknownRequests
		)
	).toEqual([]);
	expect(pageErrors).toEqual([]);
	const fields = page.locator(
		".case-edit-form input, .case-edit-form textarea"
	);
	await expect(fields).toHaveCount(7);
	for (const field of await fields.all()) {
		const bounds = await field.boundingBox();
		expect(bounds).not.toBeNull();
		if (!bounds) {
			throw new Error("Saved API plan field has no rendered bounds");
		}
		expect(bounds.x).toBeGreaterThanOrEqual(0);
		expect(bounds.y).toBeGreaterThanOrEqual(0);
		expect(bounds.x + bounds.width).toBeLessThanOrEqual(1440);
		expect(bounds.y + bounds.height).toBeLessThanOrEqual(1440);
	}
	const resultTitle = page.locator(".preview-result strong");
	const resultStep = page.locator(".preview-result small");
	await expect(resultTitle).toHaveText("Not executed");
	await expect(resultStep).toHaveText("Verify dashboard");
	const titleBounds = await resultTitle.boundingBox();
	const stepBounds = await resultStep.boundingBox();
	expect(titleBounds).not.toBeNull();
	expect(stepBounds).not.toBeNull();
	if (!(titleBounds && stepBounds)) {
		throw new Error("Execution preview footer is not rendered");
	}
	expect(stepBounds.y).toBeGreaterThanOrEqual(
		titleBounds.y + titleBounds.height + 1
	);
	await page.screenshot({
		animations: "disabled",
		fullPage: true,
		path: path.join(
			EVIDENCE_DIRECTORY,
			"checks-denied-plan-retry-readback.png"
		),
	});
});
