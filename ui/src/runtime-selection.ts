import { translate as tl } from "@ryu/i18n/core";
import type { Project } from "./data.ts";

export function runtimeSelectionLabel(
	selection: Project["runtimeSelection"]
): string {
	if (!selection) {
		return "Ryu node default";
	}
	return selection.kind === "agent"
		? tl("Agent · {agentId}", { agentId: selection.agentId })
		: tl("Model · {modelId}", { modelId: selection.modelId });
}
