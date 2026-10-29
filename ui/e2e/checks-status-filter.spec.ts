import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import type { BootstrapResponse, Project } from "../src/data.ts";
import type { ChecksAppRequestBody } from "../src/schemas.ts";
import { checksFixtureBundle } from "./fixture-bundle.ts";

// This package reuses the Desktop-pinned runner; the inventory recognizes specs that import from "@playwright/test".
interface FixtureCall {
	body?: ChecksAppRequestBody;
	method: string;
	path: string;
}

interface ChecksFixture {
	calls: FixtureCall[];
	state: BootstrapResponse;
}

declare global {
	interface Window {
		__checksStatusFixture?: ChecksFixture;
	}
}

const FIXTURE_KEY = "ryu-checks-status-filter-fixture-v1";
const EVIDENCE_DIRECTORY = path.resolve(import.meta.dirname, "evidence");

const projects: Project[] = [
	{
		id: "status-attention",
		name: "Billing recovery",
		description: "Checkout and billing recovery coverage.",
		type: "UI",
		url: "https://checks-fixture.test/billing",
		tests: 4,
		passed: 3,
		attention: 1,
		coverage: 75,
		status: "attention",
		lastRun: "Today",
		nextRun: "Not scheduled",
	},
	{
		id: "status-passed",
		name: "Catalog search",
		description: "Search and app detail coverage.",
		type: "API",
		url: "https://checks-fixture.test/catalog",
		tests: 3,
		passed: 3,
		attention: 0,
		coverage: 100,
		status: "passed",
		lastRun: "Today",
		nextRun: "Not scheduled",
	},
	{
		id: "status-ready",
		name: "Workspace setup",
		description: "New workspace initialization coverage.",
		type: "Mixed",
		url: "https://checks-fixture.test/workspace",
		tests: 2,
		passed: 0,
		attention: 0,
		coverage: 0,
		status: "idle",
		lastRun: "Never",
		nextRun: "Not scheduled",
	},
];

const initialState: BootstrapResponse = {
	agentRuns: [],
	explorations: [],
	lists: [],
	projects,
	runs: [],
	schedules: [],
	tests: [],
};

async function installFixture(page: Page) {
	await page.addInitScript({ content: checksFixtureBundle() });
	await page.addInitScript(
		({ fixtureKey, initial }) => {
			const saved = localStorage.getItem(fixtureKey);
			const schemas = window.__checksFixtureSchemas;
			if (!schemas) {
				throw new Error("Native Checks fixture codecs missing");
			}
			const fixture: ChecksFixture = {
				calls: [],
				state: saved
					? schemas.bootstrap(JSON.parse(saved))
					: structuredClone(initial),
			};
			window.__checksStatusFixture = fixture;

			const clone = <T>(value: T): T => structuredClone(value);
			window.ryu = {
				context: null,
				app: {
					request: async ({ method: requestedMethod, path, body }) => {
						const method = requestedMethod ?? "GET";
						const call: Omit<FixtureCall, "method" | "path"> = {};
						if (body !== undefined) {
							call.body = clone(body);
						}
						fixture.calls.push({ ...call, method, path });
						if (method === "GET" && path === "/bootstrap") {
							return clone(fixture.state);
						}
						if (method === "GET" && path === "/analytics") {
							return {
								coverage: 83,
								failed: 0,
								failureBuckets: [],
								passed: 6,
								projects: fixture.state.projects.length,
								runs: 0,
								tests: 9,
							};
						}
						throw new Error(
							`Unexpected Checks fixture request: ${method} ${path}`
						);
					},
				},
			};
		},
		{ fixtureKey: FIXTURE_KEY, initial: initialState }
	);
}

test("status filter selects projects and leaves the sidecar untouched", async ({
	page,
}) => {
	const browserErrors: string[] = [];
	page.on("pageerror", (error) => browserErrors.push(error.message));
	page.on("console", (message) => {
		if (message.type() === "error") {
			browserErrors.push(message.text());
		}
	});
	await installFixture(page);
	await page.goto("/?screen=all-tests");
	await expect(page.getByRole("heading", { name: "All Tests" })).toBeVisible();
	await expect(
		page.getByText("Billing recovery", { exact: true })
	).toBeVisible();
	await expect(page.getByText("Catalog search", { exact: true })).toBeVisible();
	await expect(
		page.getByText("Workspace setup", { exact: true })
	).toBeVisible();

	const callsBeforeFilter = await page.evaluate(
		() => window.__checksStatusFixture?.calls ?? []
	);
	expect(
		callsBeforeFilter.map(({ method, path }) => `${method} ${path}`).sort()
	).toEqual([
		"GET /analytics",
		"GET /analytics",
		"GET /bootstrap",
		"GET /bootstrap",
	]);
	const allStatusesButton = page.getByRole("button", {
		name: "Filter projects: All statuses",
	});
	await allStatusesButton.focus();
	await page.keyboard.press("Enter");
	await expect(
		page.getByRole("menuitemradio", { name: "Needs attention" })
	).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(
		page.getByRole("menuitemradio", { name: "Needs attention" })
	).toHaveCount(0);
	await expect(allStatusesButton).toBeFocused();
	await allStatusesButton.click();
	await expect(
		page.getByRole("menuitemradio", { name: "Needs attention" })
	).toBeVisible();
	await page.getByRole("menuitemradio", { name: "Needs attention" }).click();

	await expect(
		page.getByRole("menuitemradio", { name: "Needs attention" })
	).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: "Filter projects: Needs attention" })
	).toHaveAttribute("aria-pressed", "true");
	await expect(
		page.getByRole("button", { name: "Filter projects: Needs attention" })
	).toContainText("Needs attention");
	await expect(
		page.getByText("Billing recovery", { exact: true })
	).toBeVisible();
	await expect(page.getByText("Catalog search", { exact: true })).toHaveCount(
		0
	);
	await expect(page.getByText("Workspace setup", { exact: true })).toHaveCount(
		0
	);

	const fixture = await page.evaluate(
		() => window.__checksStatusFixture ?? null
	);
	expect(fixture).not.toBeNull();
	expect(fixture?.calls).toEqual(callsBeforeFilter);
	expect(fixture?.state.projects).toEqual(projects);

	await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
	await page.screenshot({
		animations: "disabled",
		fullPage: true,
		path: path.join(EVIDENCE_DIRECTORY, "checks-status-filter-attention.png"),
	});

	const appRoot = page.locator("#ryu-plugin-root");
	await appRoot.evaluate((root) => {
		root.classList.add("dark");
		root.setAttribute("data-ryu-theme", "dark");
		root.style.colorScheme = "dark";
	});
	await page.screenshot({
		animations: "disabled",
		fullPage: true,
		path: path.join(
			EVIDENCE_DIRECTORY,
			"checks-status-filter-attention-dark.png"
		),
	});
	await appRoot.evaluate((root) => {
		root.classList.remove("dark");
		root.removeAttribute("data-ryu-theme");
		root.style.removeProperty("color-scheme");
	});

	await page.setViewportSize({ width: 390, height: 844 });
	const activeFilterButton = page.getByRole("button", {
		name: "Filter projects: Needs attention",
	});
	const activeFilterBounds = await activeFilterButton.boundingBox();
	expect(activeFilterBounds).not.toBeNull();
	expect(activeFilterBounds?.x).toBeGreaterThanOrEqual(0);
	expect(
		(activeFilterBounds?.x ?? 0) + (activeFilterBounds?.width ?? 0)
	).toBeLessThanOrEqual(390);
	await page.screenshot({
		animations: "disabled",
		fullPage: true,
		path: path.join(
			EVIDENCE_DIRECTORY,
			"checks-status-filter-attention-narrow.png"
		),
	});

	await activeFilterButton.click();
	const statusMenuBounds = await page.getByRole("menu").boundingBox();
	expect(statusMenuBounds).not.toBeNull();
	expect(statusMenuBounds?.x).toBeGreaterThanOrEqual(0);
	expect(
		(statusMenuBounds?.x ?? 0) + (statusMenuBounds?.width ?? 0)
	).toBeLessThanOrEqual(390);
	await page.getByRole("menuitemradio", { name: "All statuses" }).click();
	await expect(
		page.getByRole("button", { name: "Filter projects: All statuses" })
	).toHaveAttribute("aria-pressed", "false");
	for (const project of projects) {
		await expect(page.getByText(project.name, { exact: true })).toBeVisible();
	}
	expect(
		await page.evaluate(() => window.__checksStatusFixture?.calls ?? [])
	).toEqual(callsBeforeFilter);
	expect(browserErrors).toEqual([]);
});
