import { Button } from "@ryu/ui/components/button.tsx";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ryu/ui/components/card.tsx";
import { Tabs, TabsList, TabsTrigger } from "@ryu/ui/components/tabs.tsx";
import { EmptyState, StatusBadge, TypeBadge } from "./components.tsx";
import {
	type AgentRun,
	CHECKS_PREVIEW_NOTICE,
	type EvidenceRecord,
	type ExplorationRecord,
	type Project,
	projectStatusLabel,
	type TestCase,
	type TestRun,
	testsForProject,
} from "./data.ts";
import { Glyph, type IconName } from "./icons.tsx";
import type { ProjectTab, Screen } from "./screen-model.ts";
import { ScreenHeader } from "./screens-dashboard.tsx";

export function ProjectDetailPage({
	project,
	tests,
	tab,
	exploration,
	agentTranscript,
	agentRun,
	onExplore,
	onHealFailure,
	onNavigate,
	onRun,
	run,
	runs,
}: {
	agentTranscript?: string;
	agentRun?: AgentRun;
	exploration?: ExplorationRecord;
	onHealFailure(runId: string, failureId: string): void;
	project: Project;
	tests: TestCase[];
	tab: ProjectTab;
	onExplore(): void;
	onNavigate(screen: Screen): void;
	onRun(): void;
	run?: TestRun;
	runs: TestRun[];
}) {
	const projectTests = testsForProject(project.id, tests);
	const tabs: Array<{ id: ProjectTab; label: string; icon: IconName }> = [
		{ id: "flow", label: "Use Case Flow", icon: "git-branch" },
		{ id: "exploration", label: "Site Exploration", icon: "activity" },
		{
			id: "tests",
			label: project.type === "API" ? "Endpoint Tests" : "Web Tests",
			icon: "test",
		},
		{ id: "actions", label: "Agent Actions", icon: "play" },
		{ id: "report", label: "Test Report", icon: "file" },
		{ id: "history", label: "Run History", icon: "clock" },
	];
	return (
		<div className="page-stack project-page">
			<div className="detail-breadcrumb">
				<Button
					onClick={() => onNavigate({ kind: "all-tests", filter: "All" })}
					type="button"
				>
					All Tests
				</Button>
				<Glyph name="arrow-right" />
				<span>{project.name}</span>
			</div>
			<ScreenHeader
				actions={
					<>
						<Button
							onClick={() => onNavigate({ kind: "test-lists" })}
							size="default"
							type="button"
							variant="outline"
						>
							<Glyph name="package" />
							Open test lists
						</Button>
						<Button
							onClick={onRun}
							size="default"
							type="button"
							variant="default"
						>
							<Glyph name="play" />
							Run project
						</Button>
					</>
				}
				description={`${project.url} · Last run ${project.lastRun}`}
				eyebrow={`${project.type === "Mixed" ? "UI + API" : project.type} project`}
				title={project.name}
			/>
			<div className="project-snapshot">
				<div>
					<span>Coverage</span>
					<strong>{project.coverage}%</strong>
					<div className="coverage-bar">
						<span style={{ width: `${project.coverage}%` }} />
					</div>
				</div>
				<div>
					<span>Latest verdict</span>
					<StatusBadge status={project.status} />
					<small>
						{project.passed} passed · {project.attention} attention
					</small>
				</div>
				<div>
					<span>Test account</span>
					<strong>Optional</strong>
					<small>Use a granted Ryu agent for authenticated browser flows</small>
				</div>
				<div>
					<span>Next run</span>
					<strong>{project.nextRun}</strong>
					<small>Schedules stay node-local</small>
				</div>
				<div>
					<span>Execution lane</span>
					<strong>{run?.evidenceLevel ?? "Ready"}</strong>
					<small>{CHECKS_PREVIEW_NOTICE}</small>
				</div>
			</div>
			<Tabs
				onValueChange={(value) => {
					const item = tabs.find((item) => item.id === value);
					if (item) {
						onNavigate({ kind: "project", id: project.id, tab: item.id });
					}
				}}
				value={tab}
			>
				<TabsList variant="line">
					{tabs.map((item) => (
						<TabsTrigger key={item.id} value={item.id}>
							<Glyph name={item.icon} />
							{item.label}
							{item.id === "report" && project.attention > 0 ? (
								<span className="tab-count">{project.attention}</span>
							) : null}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>
			{tab === "flow" ? (
				<UseCaseFlow
					onOpenTest={(id) =>
						onNavigate({
							kind: "test",
							projectId: project.id,
							testId: id,
							panel: "preview",
						})
					}
					project={project}
					tests={projectTests}
				/>
			) : null}
			{tab === "exploration" ? (
				<ExplorationView
					exploration={exploration}
					onExplore={onExplore}
					project={project}
				/>
			) : null}
			{tab === "tests" ? (
				<TestCasesView
					onOpenTest={(id) =>
						onNavigate({
							kind: "test",
							projectId: project.id,
							testId: id,
							panel: "preview",
						})
					}
					project={project}
					tests={projectTests}
				/>
			) : null}
			{tab === "actions" ? (
				<AgentActionsView agentRun={agentRun} transcript={agentTranscript} />
			) : null}
			{tab === "report" ? (
				<ReportView
					onHealFailure={onHealFailure}
					project={project}
					run={run}
					tests={projectTests}
				/>
			) : null}
			{tab === "history" ? (
				<RunHistoryView project={project} runs={runs} />
			) : null}
		</div>
	);
}

function UseCaseFlow({
	project,
	tests,
	onOpenTest,
}: {
	project: Project;
	tests: TestCase[];
	onOpenTest(id: string): void;
}) {
	const highlightedTests = tests.slice(0, 3);
	const notRun = Math.max(
		0,
		project.tests - project.passed - project.attention
	);
	return (
		<div className="project-tab-content">
			<div className="flow-layout">
				<section className="flow-canvas ts-card">
					<div className="flow-canvas-header">
						<div>
							<div className="eyebrow">Feature map</div>
							<h2>What this project plans to prove</h2>
						</div>
						<span className="flow-legend">
							<i className="legend-dot gray" />
							Not executed
						</span>
					</div>
					{highlightedTests.length > 0 ? (
						<div className="flow-map">
							<div className="flow-line line-one" />
							<div className="flow-line line-two" />
							<div className="flow-line line-three" />
							<div className="flow-root">
								<span>
									<Glyph name="folder" />
								</span>
								<strong>{project.name}</strong>
								<small>{tests.length} planned tests</small>
							</div>
							{highlightedTests.map((test, index) => (
								<div
									className={`flow-branch ${["branch-one", "branch-two", "branch-three"][index] ?? "branch-one"}`}
									key={test.id}
								>
									<span className="flow-node-icon gray">
										<Glyph name="activity" />
									</span>
									<strong>{test.feature}</strong>
									<small>
										{test.name} · {projectStatusLabel(test.status)}
									</small>
								</div>
							))}
						</div>
					) : (
						<EmptyState
							detail="Define a flow in the create wizard before collecting evidence."
							title="No planned cases yet"
						/>
					)}
				</section>
				<Card className="ts-card flow-sidebar">
					<CardHeader className="ts-card-header">
						<div>
							<CardTitle>Latest evidence</CardTitle>
							<CardDescription>No execution recorded</CardDescription>
						</div>
						<StatusBadge status="idle" />
					</CardHeader>
					<CardContent>
						<div className="evidence-stat">
							<strong>
								{project.passed}/{project.tests}
							</strong>
							<span>tests executed</span>
						</div>
						<div className="evidence-stat-row">
							<span>
								<i className="legend-dot green" />
								Passed
							</span>
							<strong>{project.passed}</strong>
						</div>
						<div className="evidence-stat-row">
							<span>
								<i className="legend-dot amber" />
								Attention
							</span>
							<strong>{project.attention}</strong>
						</div>
						<div className="evidence-stat-row">
							<span>
								<i className="legend-dot gray" />
								Not run
							</span>
							<strong>{notRun}</strong>
						</div>
						<div className="evidence-note">
							<Glyph name="file" />
							<span>
								Run the project to attach live evidence to each planned case.
							</span>
						</div>
					</CardContent>
				</Card>
			</div>
			<Card className="ts-card linked-tests">
				<CardHeader className="ts-card-header">
					<div>
						<CardTitle>Highlighted use cases</CardTitle>
						<CardDescription>
							Open a case to inspect its steps, replay, and generated source.
						</CardDescription>
					</div>
				</CardHeader>
				<CardContent>
					{tests.slice(0, 3).map((test) => (
						<Button
							className="linked-test-row"
							key={test.id}
							onClick={() => onOpenTest(test.id)}
							type="button"
						>
							<span className={`run-icon${test.status}`}>
								<Glyph name={test.status === "passed" ? "check" : "activity"} />
							</span>
							<span>
								<strong>{test.name}</strong>
								<small>
									{test.feature} · {test.steps.length} steps
								</small>
							</span>
							<TypeBadge type={test.type} />
							<Glyph name="arrow-right" />
						</Button>
					))}
				</CardContent>
			</Card>
		</div>
	);
}

function ExplorationView({
	exploration,
	onExplore,
	project,
}: {
	exploration?: ExplorationRecord;
	onExplore(): void;
	project: Project;
}) {
	return (
		<div className="project-tab-content">
			<div className="exploration-header">
				<div>
					<div className="eyebrow">Live target map</div>
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
				<div className="exploration-result">
					<div className="exploration-progress">
						<div className="exploration-progress-head">
							<span>
								{exploration.evidenceLevel} · {exploration.status}
							</span>
							<strong>{exploration.coverage}% signal coverage</strong>
						</div>
						<div className="coverage-bar">
							<span style={{ width: `${exploration.coverage}%` }} />
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
									<small>Signal: {area.signal}</small>
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
					detail={`The first exploration will fetch ${project.url} and retain a bounded live-http observation.`}
					title="No exploration yet"
				/>
			)}
		</div>
	);
}

function RunHistoryView({
	project,
	runs,
}: {
	project: Project;
	runs: TestRun[];
}) {
	return (
		<div className="project-tab-content">
			<div className="table-toolbar">
				<div>
					<div className="eyebrow">Retained runs</div>
					<h2>Run history</h2>
					<p>
						{runs.length} run{runs.length === 1 ? "" : "s"} kept for{" "}
						{project.name}; verdicts are never overwritten.
					</p>
				</div>
			</div>
			{runs.length === 0 ? (
				<EmptyState
					detail="Run the project to start a retained history."
					title="No runs yet"
				/>
			) : (
				<div className="test-table ts-card">
					<div className="test-table-head">
						<span>Verdict</span>
						<span>Trigger</span>
						<span>Coverage</span>
						<span>Evidence</span>
						<span>Finished</span>
					</div>
					{runs.map((item) => (
						<div className="test-table-row history-row" key={item.id}>
							<StatusBadge
								status={item.failed === 0 ? "passed" : "attention"}
							/>
							<span>{item.trigger}</span>
							<strong>{item.coverage}%</strong>
							<span>
								{item.evidenceLevel} · {item.passed}/{item.passed + item.failed}
							</span>
							<span>{new Date(item.finishedAt).toLocaleString()}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function TestCasesView({
	project,
	tests,
	onOpenTest,
}: {
	project: Project;
	tests: TestCase[];
	onOpenTest(id: string): void;
}) {
	return (
		<div className="project-tab-content">
			<div className="table-toolbar">
				<div>
					<div className="eyebrow">Executable coverage</div>
					<h2>{project.type === "API" ? "Endpoint tests" : "Web tests"}</h2>
					<p>{tests.length} cases in this project · select one to refine it.</p>
				</div>
				<Button
					disabled
					size="default"
					title="Add cases from the project plan"
					type="button"
					variant="outline"
				>
					<Glyph name="plus" />
					Add test from plan
				</Button>
			</div>
			<div className="test-table ts-card">
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
					tests.map((test, index) => (
						<Button
							className="test-table-row"
							key={test.id}
							onClick={() => onOpenTest(test.id)}
							type="button"
						>
							<span>
								<span
									className={
										"table-check" +
										(test.status === "passed"
											? "passed"
											: test.status === "attention"
												? "attention"
												: "idle")
									}
								>
									<Glyph
										name={test.status === "passed" ? "check" : "activity"}
									/>
								</span>
							</span>
							<span className="table-number">{index + 1}</span>
							<span>
								<span className={`priority-pill${test.priority.toLowerCase()}`}>
									{test.priority}
								</span>
							</span>
							<span className="table-test-name">
								<strong>{test.name}</strong>
								<small>
									{test.feature} · Updated {test.updated}
								</small>
							</span>
							<span className="table-description">{test.description}</span>
							<TypeBadge type={test.type} />
						</Button>
					))
				)}
			</div>
		</div>
	);
}

function AgentActionsView({
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
					<div className="eyebrow">Optional Ryu agent lane</div>
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
					<pre className="terminal-output agent-transcript">{transcript}</pre>
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

function ReportView({
	onHealFailure,
	project,
	run,
	tests,
}: {
	onHealFailure(runId: string, failureId: string): void;
	project: Project;
	run?: TestRun;
	tests: TestCase[];
}) {
	if (!run) {
		return (
			<div className="project-tab-content">
				<div className="report-hero ts-card">
					<div className="report-score">
						<span className="score-ring">
							<strong>—</strong>
						</span>
						<div>
							<div className="eyebrow">Ready for a live run</div>
							<h2>No verdict recorded yet.</h2>
							<p>
								{tests.length} planned case{tests.length === 1 ? "" : "s"} will
								produce evidence, a coverage score, and failure bundles.
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
			<div className="report-hero ts-card">
				<div className="report-score">
					<span className="score-ring">
						<strong>{run.coverage}%</strong>
					</span>
					<div>
						<div className="eyebrow">
							{run.evidenceLevel} · {run.trigger}
						</div>
						<h2>{run.summary}</h2>
						<p>
							{run.passed} passed · {run.failed} attention · {run.durationMs} ms
							· {run.evidence.length} evidence records
						</p>
					</div>
				</div>
				<StatusBadge status={project.status} />
			</div>
			<div className="report-columns">
				<Card className="ts-card failure-card">
					<CardHeader className="ts-card-header">
						<div>
							<CardTitle>Failure analysis</CardTitle>
							<CardDescription>One bundle per failing case</CardDescription>
						</div>
						<span className="failure-count">{run.failures.length}</span>
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
				<Card className="ts-card suggestion-card">
					<CardHeader className="ts-card-header">
						<div>
							<CardTitle>Next step</CardTitle>
							<CardDescription>Evidence capabilities</CardDescription>
						</div>
						<span className="suggestion-spark">✦</span>
					</CardHeader>
					<CardContent>
						<p>
							HTTP evidence is retained for this run. Screenshots and DOM
							snapshots are shown only when a granted browser-capable Ryu agent
							actually provides them.
						</p>
						<div className="settings-note">
							<Glyph name="activity" />
							<span>
								{run.evidence.filter((item) => item.screenshotAvailable).length}{" "}
								screenshots ·{" "}
								{
									run.evidence.filter((item) => item.domSnapshotAvailable)
										.length
								}{" "}
								DOM snapshots · {run.evidence.length} live observations
							</span>
						</div>
					</CardContent>
				</Card>
			</div>
			<EvidenceList evidence={run.evidence} tests={tests} />
		</div>
	);
}

function EvidenceList({
	evidence,
	tests,
}: {
	evidence: EvidenceRecord[];
	tests: TestCase[];
}) {
	return (
		<Card className="ts-card evidence-card">
			<CardHeader className="ts-card-header">
				<div>
					<CardTitle>Evidence artifacts</CardTitle>
					<CardDescription>
						Bounded observations retained with this run
					</CardDescription>
				</div>
				<span className="recording-note">{evidence.length} records</span>
			</CardHeader>
			<CardContent>
				{evidence.map((item) => (
					<div className="evidence-record" key={item.id}>
						<div className="evidence-record-header">
							<div>
								<strong>
									{tests.find((test) => test.id === item.testId)?.name ??
										item.testId}
								</strong>
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
								{item.domSnapshotAvailable ? "DOM snapshot" : "No DOM snapshot"}
							</span>
						</div>
						<pre>{item.textPreview || "No bounded text preview returned."}</pre>
					</div>
				))}
			</CardContent>
		</Card>
	);
}
