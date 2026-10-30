import { RyuAppList, RyuAppListItem } from "@ryu/blocks/companion/app-ui";
import { useLiteralMessages } from "@ryu/i18n/react";
import { Button } from "@ryu/ui/components/button.tsx";
import { formatDateTime } from "@ryu/ui/lib/timezone.ts";
import styles from "./checks.module.css";
import { EmptyState, StatusBadge, TypeBadge } from "./components.tsx";
import type { ChecksCoverageStyle } from "./coverage.ts";
import type {
	AgentRun,
	ExplorationRecord,
	Project,
	TestCase,
	TestRun,
} from "./data.ts";
import { Glyph } from "./icons.tsx";

export function ExplorationView({
	exploration,
	onExplore,
	project,
}: {
	exploration?: ExplorationRecord;
	onExplore(): void;
	project: Project;
}) {
	const tl = useLiteralMessages();
	const explorationCoverage: ChecksCoverageStyle = {
		"--checks-coverage": `${exploration?.coverage ?? 0}%`,
	};
	return (
		<div className="project-tab-content">
			<div className="exploration-header">
				<div>
					<h2>Site exploration</h2>
					<p>
						Fetch the target once to map feature signals before generating or
						refining the test suite.
					</p>
				</div>
				<Button
					onClick={onExplore}
					size="default"
					type="button"
					variant="outline"
				>
					<Glyph name="activity" />
					{exploration ? "Explore again" : "Explore target"}
				</Button>
			</div>
			{exploration ? (
				<div>
					<div className="exploration-progress">
						<div className="exploration-progress-head">
							<span>
								{exploration.evidenceLevel} · {exploration.status}
							</span>
							<strong>
								{tl("{coverage}% signal coverage", {
									coverage: String(exploration.coverage),
								})}
							</strong>
						</div>
						<div className="coverage-bar">
							<span
								className={styles.coverageFill}
								style={explorationCoverage}
							/>
						</div>
					</div>
					<div className="feature-map-list">
						{exploration.featureAreas.map((area) => (
							<div className="feature-map-row" key={area.name}>
								<span
									className={`feature-map-icon${area.observed ? "done" : ""}`}
								>
									<Glyph name={area.observed ? "check" : "activity"} />
								</span>
								<div>
									<strong>{area.name}</strong>
									<small>
										{tl("Signal: {signal}", { signal: area.signal })}
									</small>
								</div>
								<span
									className={`feature-map-status${area.observed ? "done" : ""}`}
								>
									{area.observed ? "Observed" : "Not found"}
								</span>
							</div>
						))}
					</div>
					<div className="evidence-note">
						<Glyph name="file" />
						<span>
							{exploration.pages[0]?.statusCode} ·{" "}
							{exploration.pages[0]?.title ?? "Untitled response"} ·{" "}
							{exploration.pages[0]?.responseTimeMs ?? 0} ms · {project.url}
						</span>
					</div>
				</div>
			) : (
				<EmptyState
					detail={tl(
						"The first exploration will fetch {url} and retain a bounded live-http observation.",
						{ url: project.url }
					)}
					title="No exploration yet"
				/>
			)}
		</div>
	);
}

export function RunHistoryView({
	project,
	runs,
}: {
	project: Project;
	runs: TestRun[];
}) {
	const tl = useLiteralMessages();
	return (
		<div className="project-tab-content">
			<div className="table-toolbar">
				<div>
					<h2>Run history</h2>
					<p>
						{tl(
							"{count, plural, one {{countText} run} other {{countText} runs}} kept for {name}; verdicts are never overwritten.",
							{
								count: runs.length,
								countText: String(runs.length),
								name: project.name,
							}
						)}
					</p>
				</div>
			</div>
			{runs.length === 0 ? (
				<EmptyState
					detail="Run the project to start a retained history."
					title="No runs yet"
				/>
			) : (
				<div className="test-table run-history-table">
					<div className="test-table-head">
						<span>Verdict</span>
						<span>Trigger</span>
						<span>Coverage</span>
						<span>Evidence</span>
						<span>Finished</span>
					</div>
					{runs.map((item) => (
						<div className="test-table-row" key={item.id}>
							<StatusBadge
								status={item.failed === 0 ? "passed" : "attention"}
							/>
							<span>{item.trigger}</span>
							<strong>{item.coverage}%</strong>
							<span>
								{item.evidenceLevel} · {item.passed}/{item.passed + item.failed}
							</span>
							<span>{formatDateTime(item.finishedAt)}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export function TestCasesView({
	project,
	tests,
	onOpenTest,
}: {
	project: Project;
	tests: TestCase[];
	onOpenTest(id: string): void;
}) {
	const tl = useLiteralMessages();
	return (
		<div className="project-tab-content">
			<div className="table-toolbar">
				<div>
					<h2>{project.type === "API" ? "Endpoint tests" : "Web tests"}</h2>
					<p>
						{tl("{length} cases in this project · select one to refine it.", {
							length: String(tests.length),
						})}
					</p>
				</div>
			</div>
			<div className="test-table">
				<div className="test-table-head">
					<span>Status</span>
					<span>No.</span>
					<span>Priority</span>
					<span>Test name</span>
					<span>Test description</span>
					<span>Type</span>
				</div>
				{tests.length === 0 ? (
					<EmptyState
						detail="Create a plan to generate the first cases."
						title="No tests yet"
					/>
				) : (
					<RyuAppList aria-label="Project test cases">
						{tests.map((test, index) => (
							<RyuAppListItem
								key={test.id}
								onClick={() => onOpenTest(test.id)}
								title={
									<span>
										<span>
											<span
												className={`table-check ${test.status === "passed" ? "passed" : test.status === "attention" ? "attention" : ""}`}
											>
												<Glyph
													name={test.status === "passed" ? "check" : "activity"}
												/>
											</span>
										</span>
										<span className="table-number">{index + 1}</span>
										<span>
											<span
												className={`priority-pill${test.priority.toLowerCase()}`}
											>
												{test.priority}
											</span>
										</span>
										<span className="table-test-name">
											<strong>{test.name}</strong>
											<small>
												{tl("{feature} · Updated {updated}", {
													feature: test.feature,
													updated: test.updated,
												})}
											</small>
										</span>
										<span className="table-description">
											{test.description}
										</span>
										<TypeBadge type={test.type} />
									</span>
								}
							/>
						))}
					</RyuAppList>
				)}
			</div>
		</div>
	);
}

export function AgentActionsView({
	agentRun,
	transcript,
}: {
	agentRun?: AgentRun;
	transcript?: string;
}) {
	return (
		<div className="project-tab-content">
			<div className="exploration-header">
				<div>
					<h2>Agent actions</h2>
					<p>
						When the selected agent has browser access, its transcript stays
						separate from the deterministic live-http verdict.
					</p>
				</div>
				<span className="recording-note">
					{agentRun
						? `${agentRun.evidenceLevel} · ${agentRun.verdict}`
						: transcript
							? "Captured"
							: "No agent run"}
				</span>
			</div>
			{transcript ? (
				<>
					{agentRun?.artifacts.length ? (
						<div className="agent-artifact-list">
							{agentRun.artifacts.map((artifact) => (
								<span
									className="recording-note"
									key={`${artifact.kind}-${artifact.label}`}
								>
									{artifact.available ? "Captured" : "Not captured"} ·{" "}
									{artifact.label}
								</span>
							))}
						</div>
					) : null}
					<pre className="terminal-output">{transcript}</pre>
				</>
			) : (
				<EmptyState
					detail="Choose a Ryu agent lane when creating a project, then run it from the project header."
					title="No agent transcript"
				/>
			)}
		</div>
	);
}
