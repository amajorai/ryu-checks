import { useLiteralMessages } from "@ryu/i18n/react";
import { Button } from "@ryu/ui/components/button.tsx";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ryu/ui/components/card.tsx";
import { ChecksCard, EmptyState, StatusBadge } from "./components.tsx";
import type { EvidenceRecord, Project, TestCase, TestRun } from "./data.ts";
import {
	EvidenceArtifactsViewer,
	type LoadEvidence,
} from "./evidence-viewer.tsx";
import { Glyph } from "./icons.tsx";

export function ReportView({
	onHealFailure,
	onLoadEvidence,
	project,
	run,
	tests,
}: {
	onHealFailure(runId: string, failureId: string): void;
	onLoadEvidence: LoadEvidence;
	project: Project;
	run?: TestRun;
	tests: TestCase[];
}) {
	const tl = useLiteralMessages();
	if (!run) {
		return (
			<div className="project-tab-content">
				<div className="report-summary">
					<div className="report-score">
						<span className="score-ring">
							<strong>—</strong>
						</span>
						<div>
							<h2>No verdict recorded yet.</h2>
							<p>
								{tl(
									"{count, plural, one {{countText} planned case} other {{countText} planned cases}} will produce evidence, a coverage score, and failure bundles.",
									{ count: tests.length, countText: String(tests.length) }
								)}
							</p>
						</div>
					</div>
					<StatusBadge status={project.status} />
				</div>
			</div>
		);
	}
	return (
		<div className="project-tab-content">
			<div className="report-summary">
				<div className="report-score">
					<span className="score-ring">
						<strong>{run.coverage}%</strong>
					</span>
					<div>
						<h2>{run.summary}</h2>
						<p>
							{tl(
								"{passed} passed · {failed} attention · {durationMs} ms · {length} evidence records",
								{
									passed: String(run.passed),
									failed: String(run.failed),
									durationMs: String(run.durationMs),
									length: String(run.evidence.length),
								}
							)}
						</p>
					</div>
				</div>
				<StatusBadge status={project.status} />
			</div>
			<div className="report-columns">
				<Card>
					<CardHeader>
						<div>
							<CardTitle>Failure analysis</CardTitle>
							<CardDescription>One bundle per failing case</CardDescription>
						</div>
						<CardAction>
							<span className="failure-count">{run.failures.length}</span>
						</CardAction>
					</CardHeader>
					<CardContent>
						{run.failures.length === 0 ? (
							<EmptyState
								detail="Every planned case met the live-http checks."
								title="No failure bundles"
							/>
						) : (
							run.failures.map((failure) => (
								<div className="failure-row" key={failure.id}>
									<strong>{failure.title}</strong>
									<small>
										{failure.failedStep} · {failure.rootCause}
									</small>
									<p>{failure.suggestedFix}</p>
									<code>{failure.source}</code>
									{failure.screenshotAvailable || failure.domSnapshot ? (
										<EvidenceArtifactsViewer
											evidenceId={failure.evidenceId}
											label={failure.title}
											onLoadEvidence={onLoadEvidence}
										/>
									) : null}
									<div className="failure-actions">
										<span>
											{failure.status === "healed"
												? "Plan healed"
												: "Product signal still requires verification"}
										</span>
										<Button
											disabled={failure.status === "healed"}
											onClick={() => onHealFailure(run.id, failure.id)}
											size="sm"
											type="button"
											variant="outline"
										>
											{failure.status === "healed" ? "Healed" : "Heal plan"}
										</Button>
									</div>
								</div>
							))
						)}
					</CardContent>
				</Card>
				<ChecksCard className="suggestion-card">
					<CardHeader>
						<div>
							<CardTitle>Next step</CardTitle>
							<CardDescription>Evidence capabilities</CardDescription>
						</div>
						<CardAction>
							<span aria-hidden="true" className="suggestion-spark">
								✦
							</span>
						</CardAction>
					</CardHeader>
					<CardContent>
						<p>
							HTTP evidence is retained for this run. UI cases also capture a
							real browser screenshot and DOM snapshot when the Ryu Browser can
							open the target; otherwise they are labeled live-http-fallback
							with the reason. Open retained files from an evidence record.
						</p>
						<div className="settings-note">
							<Glyph name="activity" />
							<span>
								{tl(
									"{length} screenshots · {domSnapshots} DOM snapshots · {observations} live observations",
									{
										length: String(
											run.evidence.filter((item) => item.screenshotAvailable)
												.length
										),
										domSnapshots: String(
											run.evidence.filter((item) => item.domSnapshotAvailable)
												.length
										),
										observations: String(run.evidence.length),
									}
								)}
							</span>
						</div>
					</CardContent>
				</ChecksCard>
			</div>
			<EvidenceList
				evidence={run.evidence}
				onLoadEvidence={onLoadEvidence}
				tests={tests}
			/>
		</div>
	);
}

function EvidenceList({
	evidence,
	onLoadEvidence,
	tests,
}: {
	evidence: EvidenceRecord[];
	onLoadEvidence: LoadEvidence;
	tests: TestCase[];
}) {
	const tl = useLiteralMessages();
	return (
		<ChecksCard className="evidence-card">
			<CardHeader>
				<div>
					<CardTitle>Evidence artifacts</CardTitle>
					<CardDescription>
						Bounded observations retained with this run
					</CardDescription>
				</div>
				<CardAction>
					<span className="recording-note">
						{tl("{length} records", { length: String(evidence.length) })}
					</span>
				</CardAction>
			</CardHeader>
			<CardContent>
				{evidence.map((item) => {
					const caseName =
						tests.find((test) => test.id === item.testId)?.name ?? item.testId;
					return (
						<div className="evidence-record" key={item.id}>
							<div className="evidence-record-header">
								<div>
									<strong>{caseName}</strong>
									<small>
										{item.statusCode} · {item.title ?? "Untitled response"} ·{" "}
										{item.url}
									</small>
								</div>
								<span>{item.responseTimeMs} ms</span>
							</div>
							<div className="evidence-record-badges">
								<span>{item.level}</span>
								<span>
									{item.screenshotAvailable ? "Screenshot" : "No screenshot"}
								</span>
								<span>
									{item.domSnapshotAvailable
										? "DOM snapshot"
										: "No DOM snapshot"}
								</span>
							</div>
							{item.browserNote ? <small>{item.browserNote}</small> : null}
							{item.screenshotAvailable || item.domSnapshotAvailable ? (
								<EvidenceArtifactsViewer
									evidenceId={item.id}
									label={caseName}
									onLoadEvidence={onLoadEvidence}
								/>
							) : null}
							<pre>
								{item.textPreview || "No bounded text preview returned."}
							</pre>
						</div>
					);
				})}
			</CardContent>
		</ChecksCard>
	);
}
