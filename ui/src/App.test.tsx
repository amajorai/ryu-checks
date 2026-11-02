import { describe, expect, test } from "bun:test";
import { runtimeSelectionLabel } from "./App.tsx";

describe("Checks runtime selection", () => {
	test("labels the node default and explicit agent/model lanes", () => {
		expect(runtimeSelectionLabel(undefined)).toBe("Ryu node default");
		expect(runtimeSelectionLabel({ kind: "agent", agentId: "qa" })).toBe(
			"Agent · qa"
		);
		expect(
			runtimeSelectionLabel({
				kind: "model",
				modelId: "gpt-5",
				providerId: "openai",
			})
		).toBe("Model · gpt-5");
	});
});
