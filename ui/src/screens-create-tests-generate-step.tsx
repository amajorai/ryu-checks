import type { RyuCatalogSnapshot } from "@ryu/app-host/app-bridge";
import type { RyuPickerSelection } from "@ryu/blocks/composer/runtime-picker";
import { useLiteralMessages } from "@ryu/i18n/react";
import { Badge } from "@ryu/ui/components/badge.tsx";
import { StatusBadge } from "./components.tsx";
import { Glyph } from "./icons.tsx";

export function GenerateStep({
	name,
	runtimeCatalog,
	runtimeSelection,
	selectedCount,
	url,
}: {
	name: string;
	runtimeCatalog: RyuCatalogSnapshot | null;
	runtimeSelection?: RyuPickerSelection;
	selectedCount: number;
	url: string;
}) {
	const tl = useLiteralMessages();
	const runtimeLabel = runtimeSelection
		? runtimeSelection.kind === "agent"
			? (runtimeCatalog?.agents.find(
					(agent) => agent.id === runtimeSelection.agentId
				)?.name ?? runtimeSelection.agentId)
			: runtimeSelection.modelId
		: "Ryu host default";
	const runtimeDetail = runtimeSelection
		? runtimeSelection.kind === "agent"
			? "Saved as an optional Ryu agent selection"
			: tl("Saved for the selected model lane ({provider})", {
					provider:
						runtimeCatalog?.providers.find(
							(provider) => provider.id === runtimeSelection.providerId
						)?.label ?? runtimeSelection.providerId,
				})
		: runtimeCatalog
			? "No runner connected"
			: "Open inside Ryu to browse the catalog";
	return (
		<div className="wizard-middle">
			<div className="generate-summary">
				<span className="generate-spark">
					<Glyph name="test" />
				</span>
				<div>
					<h2>Save an unexecuted test plan</h2>
					<p>
						{tl(
							"{name} will be created on this node with an editable plan. Explore the target, run live checks, and keep the resulting evidence bundle.",
							{ name }
						)}
					</p>
				</div>
				<StatusBadge status="idle" />
			</div>
			<div className="generation-grid">
				<div className="generation-card">
					<span className="generation-number">{selectedCount}</span>
					<strong>Planning cases</strong>
					<small>Selected for this local plan</small>
				</div>
				<div className="generation-card">
					<span className="generation-number">0</span>
					<strong>Feature areas</strong>
					<small>Exploration has not run</small>
				</div>
				<div className="generation-card">
					<span className="generation-number">1</span>
					<strong>Target</strong>
					<small>{url}</small>
				</div>
			</div>
			<div className="runtime-selection-summary">
				<div>
					<strong>{runtimeLabel}</strong>
					<small>{runtimeDetail}</small>
				</div>
				<Badge variant="outline">Ready</Badge>
			</div>
			<div className="generate-checklist">
				<div>
					<Glyph name="activity" />
					<span>Plan can be refined locally</span>
				</div>
				<div>
					<Glyph name="check" />
					<span>Live HTTP evidence is retained per run</span>
				</div>
				<div>
					<Glyph name="clock" />
					<span>Node-local schedules can be added later</span>
				</div>
			</div>
		</div>
	);
}
