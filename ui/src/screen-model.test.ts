import { describe, expect, test } from "bun:test";
import { screenKey } from "./screen-model.ts";

describe("Checks navigation state", () => {
	test("keeps filters, wizard steps, and project tabs in the route key", () => {
		expect(screenKey({ kind: "all-tests", filter: "API" })).toBe(
			"all-tests:API"
		);
		expect(screenKey({ kind: "create-tests", step: 2 })).toBe("create-tests:2");
		expect(
			screenKey({ kind: "project", id: "storefront", tab: "report" })
		).toBe("project:storefront:report");
	});

	test("distinguishes a test detail panel from its project", () => {
		expect(
			screenKey({
				kind: "test",
				projectId: "storefront",
				testId: "checkout",
				panel: "code",
			})
		).toBe("test:storefront:checkout:code");
	});
});
