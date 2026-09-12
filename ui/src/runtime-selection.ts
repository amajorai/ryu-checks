import type { Project } from "./data.ts";

export function runtimeSelectionLabel(
	selection: Project["runtimeSelection"]
): string {
	if (!selection) {
		return "Ryu node default";
	}
	return selection.kind === "agent"
		? `Agent · ${selection.agentId}`
		: `Model · ${selection.modelId}`;
}
