import { useLiteralMessages } from "@ryu/i18n/react";
import { StatusBadge } from "./components.tsx";
import { Glyph, type IconName } from "./icons.tsx";

export function ExplorationStep({ url }: { url: string }) {
	const tl = useLiteralMessages();
	return (
		<div className="wizard-middle">
			<div className="step-callout">
				<span className="step-callout-icon">
					<Glyph name="activity" />
				</span>
				<div>
					<h2>Explore immediately after saving</h2>
					<p>
						The project will use the node-local runner to map live feature
						signals before you refine the generated cases.
					</p>
				</div>
				<StatusBadge status="idle" />
			</div>
			<div className="exploration-progress">
				<div className="exploration-progress-head">
					<span>Queued live exploration</span>
					<strong>0%</strong>
				</div>
				<div className="coverage-bar">
					<span className="w-0" />
				</div>
				<small>
					{tl("{url} · The target is checked after the project is saved", {
						url,
					})}
				</small>
			</div>
			<div className="feature-map-list">
				<FeatureMapRow
					detail="Mapped by the node runner after save"
					done={false}
					icon="user"
					title="Authentication"
				/>
				<FeatureMapRow
					detail="Mapped by the node runner after save"
					done={false}
					icon="search"
					title="Marketplace search"
				/>
				<FeatureMapRow
					detail="Not explored"
					done={false}
					icon="package"
					title="Checkout"
				/>
				<FeatureMapRow
					detail="Not explored"
					done={false}
					icon="settings"
					title="Workspace settings"
				/>
			</div>
			<span className="recording-note">
				<Glyph name="activity" /> Runs after save
			</span>
		</div>
	);
}

function FeatureMapRow({
	icon,
	title,
	detail,
	done,
}: {
	icon: IconName;
	title: string;
	detail: string;
	done: boolean;
}) {
	return (
		<div className="feature-map-row">
			<span
				className={["feature-map-icon", done && "done"]
					.filter(Boolean)
					.join(" ")}
			>
				<Glyph name={done ? "check" : icon} />
			</span>
			<div>
				<strong>{title}</strong>
				<small>{detail}</small>
			</div>
			<span
				className={["feature-map-status", done && "done"]
					.filter(Boolean)
					.join(" ")}
			>
				{done ? "Mapped" : "Queued"}
			</span>
		</div>
	);
}
