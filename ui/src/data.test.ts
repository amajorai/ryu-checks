import { describe, expect, test } from "bun:test";
import {
	initialProjects,
	initialTests,
	overallCoverage,
	projectStatusClass,
	projectStatusLabel,
	testsForProject,
	typeClass,
} from "./data";

describe("Tests local workspace data", () => {
	test("filters test cases by project without mutating fixtures", () => {
		const storefrontTests = testsForProject("storefront");

		expect(storefrontTests.map((testCase) => testCase.id)).toEqual([
			"storefront-sign-in",
			"storefront-search",
			"storefront-checkout",
		]);
		expect(initialTests).toHaveLength(5);
	});

	test("summarizes project status and coverage", () => {
		expect(projectStatusLabel("passed")).toBe("Passed");
		expect(projectStatusLabel("attention")).toBe("Needs attention");
		expect(projectStatusLabel("running")).toBe("Running");
		expect(projectStatusClass("passed")).toBe("status-pass");
		expect(projectStatusClass("attention")).toBe("status-attention");
		expect(overallCoverage(initialProjects)).toBe(84);
	});

	test("maps each test type to a stable visual class", () => {
		expect(typeClass("UI")).toBe("type-ui");
		expect(typeClass("API")).toBe("type-api");
		expect(typeClass("MCP")).toBe("type-mcp");
	});
});
