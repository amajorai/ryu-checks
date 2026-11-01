import { useLiteralMessages } from "@ryu/i18n/react";
import { Button } from "@ryu/ui/components/button.tsx";
import { useState } from "react";
import type { EvidenceArtifacts } from "./data.ts";

/** Fetches the retained files for one evidence id (`GET /evidence/:id`). */
export type LoadEvidence = (evidenceId: string) => Promise<EvidenceArtifacts>;

type ViewerState =
	| { kind: "idle" }
	| { kind: "loading" }
	| { kind: "loaded"; artifacts: EvidenceArtifacts }
	| { kind: "error"; message: string };

/** Inline `data:` URL for a retained PNG, or `null` when none is on disk. */
export function evidenceScreenshotSrc(
	artifacts: EvidenceArtifacts
): string | null {
	const screenshot = artifacts.screenshot;
	if (!screenshot) {
		return null;
	}
	return `data:${screenshot.mime};base64,${screenshot.data}`;
}

function DomSnapshot({ snapshot }: { snapshot: unknown }) {
	// Snapshots can be up to 2 MiB; only serialize them once the user opens them.
	const [open, setOpen] = useState(false);
	return (
		<details
			className="evidence-dom"
			onToggle={(event) => setOpen(event.currentTarget.open)}
		>
			<summary>DOM snapshot</summary>
			{open ? <pre>{JSON.stringify(snapshot, null, 2)}</pre> : null}
		</details>
	);
}

function LoadedArtifacts({
	artifacts,
	label,
	onHide,
}: {
	artifacts: EvidenceArtifacts;
	label: string;
	onHide(): void;
}) {
	const tl = useLiteralMessages();
	const screenshotSrc = evidenceScreenshotSrc(artifacts);
	const snapshot = artifacts.domSnapshot;
	return (
		<div className="evidence-artifacts">
			{screenshotSrc ? (
				<img
					alt={tl("Browser screenshot captured for {label}", { label })}
					className="evidence-screenshot"
					src={screenshotSrc}
				/>
			) : (
				<small>This node no longer retains a screenshot for this record.</small>
			)}
			{snapshot === undefined || snapshot === null ? (
				<small>
					This node no longer retains a DOM snapshot for this record.
				</small>
			) : (
				<DomSnapshot snapshot={snapshot} />
			)}
			<Button onClick={onHide} size="sm" type="button" variant="ghost">
				Hide evidence
			</Button>
		</div>
	);
}

/**
 * Lazily loads and renders the screenshot and DOM snapshot retained for one
 * evidence record. Nothing is fetched until the user asks for it.
 */
export function EvidenceArtifactsViewer({
	evidenceId,
	label,
	onLoadEvidence,
}: {
	evidenceId: string;
	label: string;
	onLoadEvidence: LoadEvidence;
}) {
	const [state, setState] = useState<ViewerState>({ kind: "idle" });

	async function load() {
		setState({ kind: "loading" });
		try {
			setState({
				kind: "loaded",
				artifacts: await onLoadEvidence(evidenceId),
			});
		} catch (error) {
			setState({
				kind: "error",
				message:
					error instanceof Error && error.message
						? error.message
						: "The retained evidence could not be loaded.",
			});
		}
	}

	if (state.kind === "loaded") {
		return (
			<LoadedArtifacts
				artifacts={state.artifacts}
				label={label}
				onHide={() => setState({ kind: "idle" })}
			/>
		);
	}
	return (
		<div className="evidence-artifacts-actions">
			<Button
				disabled={state.kind === "loading"}
				onClick={() => void load()}
				size="sm"
				type="button"
				variant="outline"
			>
				{state.kind === "loading"
					? "Loading evidence…"
					: "View screenshot and DOM snapshot"}
			</Button>
			{state.kind === "error" ? (
				<small role="alert">{state.message}</small>
			) : null}
		</div>
	);
}
