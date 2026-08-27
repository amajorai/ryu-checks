import { Button } from "@ryu/ui/components/button.tsx";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ryu/ui/components/card.tsx";
import { EmptyState, StatusBadge, TypeBadge } from "./components.tsx";
import {
	type Project,
	type RunStatus,
	type TestCase,
	testsForProject,
} from "./data.ts";
import { Glyph, type IconName } from "./icons.tsx";
import { runtimeSelectionLabel } from "./runtime-selection.ts";
import type { ProjectTab, Screen } from "./screen-model.ts";
import { ScreenHeader } from "./screens-dashboard.tsx";

export function ProjectDetailPage({
	project,
	tests,
	tab,
	onNavigate,
	onRun,
}: {
	project: Project;
	tests: TestCase[];
	tab: ProjectTab;
	onNavigate(screen: Screen): void;
	onRun(): void;
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
							className="ts-btn ts-btn-secondary"
							onClick={() => onNavigate({ kind: "test-lists" })}
							type="button"
						>
							<Glyph name="package" />
							Add to list
						</Button>
						<Button
							className="ts-btn ts-btn-primary"
							onClick={onRun}
							type="button"
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
					<strong>Ryu demo account</strong>
					<small>Credentials stay on this node</small>
				</div>
				<div>
					<span>Next run</span>
					<strong>{project.nextRun}</strong>
					<small>Managed by Monitoring</small>
				</div>
				<div>
					<span>Execution lane</span>
					<strong>Ryu bridge</strong>
					<small>{runtimeSelectionLabel(project.runtimeSelection)}</small>
				</div>
			</div>
			<div className="detail-tabs" role="tablist">
				{tabs.map((item) => (
					<Button
						aria-selected={tab === item.id}
						className={tab === item.id ? "is-selected" : ""}
						key={item.id}
						onClick={() =>
							onNavigate({ kind: "project", id: project.id, tab: item.id })
						}
						role="tab"
						type="button"
					>
						<Glyph name={item.icon} />
						{item.label}
						{item.id === "report" && project.attention > 0 ? (
							<span className="tab-count">{project.attention}</span>
						) : null}
					</Button>
				))}
			</div>
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
			{tab === "exploration" ? <ExplorationView project={project} /> : null}
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
			{tab === "actions" ? <AgentActionsView /> : null}
			{tab === "report" ? (
				<ReportView
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
	return (
		<div className="project-tab-content">
			<div className="flow-layout">
				<section className="flow-canvas ts-card">
					<div className="flow-canvas-header">
						<div>
							<div className="eyebrow">Feature map</div>
							<h2>What this project proves</h2>
						</div>
						<span className="flow-legend">
							<i className="legend-dot green" />
							Passed <i className="legend-dot amber" />
							Attention <i className="legend-dot gray" />
							Not covered
						</span>
					</div>
					<div className="flow-map">
						<div className="flow-line line-one" />
						<div className="flow-line line-two" />
						<div className="flow-line line-three" />
						<div className="flow-root">
							<span>
								<Glyph name="folder" />
							</span>
							<strong>{project.name}</strong>
							<small>{project.tests} linked tests</small>
						</div>
						<div className="flow-branch branch-one">
							<span className="flow-node-icon green">
								<Glyph name="check" />
							</span>
							<strong>Authentication</strong>
							<small>2 use cases · Passed</small>
						</div>
						<div className="flow-branch branch-two">
							<span className="flow-node-icon green">
								<Glyph name="check" />
							</span>
							<strong>Marketplace search</strong>
							<small>3 use cases · Passed</small>
						</div>
						<div className="flow-branch branch-three">
							<span className="flow-node-icon amber">
								<Glyph name="activity" />
							</span>
							<strong>Checkout</strong>
							<small>1 use case · Needs attention</small>
						</div>
					</div>
				</section>
				<Card className="ts-card flow-sidebar">
					<CardHeader className="ts-card-header">
						<div>
							<CardTitle>Latest evidence</CardTitle>
							<CardDescription>Run #42 · 12 minutes ago</CardDescription>
						</div>
						<StatusBadge status={project.status} />
					</CardHeader>
					<CardContent>
						<div className="evidence-stat">
							<strong>
								{project.passed}/{project.tests}
							</strong>
							<span>tests passed</span>
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
							<strong>0</strong>
						</div>
						<div className="evidence-note">
							<Glyph name="file" />
							<span>
								Failure evidence includes the step, screenshot, and suggested
								fix.
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

function ExplorationView({ project }: { project: Project }) {
	const areas: [string, string, string, RunStatus][] = [
		["Authentication", "Sign-in and recovery flows", "2m 14s", "passed"],
		[
			"Marketplace search",
			"Search, filters, and detail navigation",
			"1m 38s",
			"passed",
		],
		[
			"Checkout",
			"Cart, billing, and recoverable errors",
			"0m 52s",
			"attention",
		],
		["Workspace settings", "Permissions and preferences", "Queued", "idle"],
	];
	return (
		<div className="project-tab-content">
			<div className="exploration-header">
				<div>
					<div className="eyebrow">Observed flows</div>
					<h2>Site exploration</h2>
					<p>
						Feature-by-feature recordings of what Ryu saw while learning{" "}
						{project.name}.
					</p>
				</div>
				<Button className="ts-btn ts-btn-secondary" type="button">
					<Glyph name="play" />
					Explore again
				</Button>
			</div>
			<div className="exploration-grid">
				{areas.map(([title, detail, duration, status]) => (
					<Card className="ts-card exploration-card" key={title}>
						<div className="exploration-thumb">
							<div className="browser-chrome">
								<span />
								<span />
								<span />
							</div>
							<div className="exploration-screen">
								<div className="screen-skeleton wide" />
								<div className="screen-skeleton" />
								<div className="screen-skeleton short" />
								<span className="play-bubble">
									<Glyph name="play" />
								</span>
							</div>
						</div>
						<CardContent>
							<div className="exploration-card-title">
								<strong>{title}</strong>
								<StatusBadge status={status} />
							</div>
							<p>{detail}</p>
							<small>
								<Glyph name="clock" />
								{duration}
							</small>
						</CardContent>
					</Card>
				))}
			</div>
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
				<Button className="ts-btn ts-btn-secondary" type="button">
					<Glyph name="plus" />
					Add test
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
										(test.status === "passed" ? "passed" : "attention")
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

function AgentActionsView() {
	const actions = [
		["Sign in and reach dashboard", "Authentication", "Passed", "01:42"],
		["Search for an app", "Marketplace search", "Passed", "00:58"],
		["Recover from billing error", "Checkout", "Attention", "00:24"],
	];
	return (
		<div className="project-tab-content">
			<div className="exploration-header">
				<div>
					<div className="eyebrow">Session replay</div>
					<h2>Agent actions</h2>
					<p>
						Replayable evidence of an agent driving the product like a real
						user.
					</p>
				</div>
				<span className="recording-note">
					<span />
					Recordings retained locally
				</span>
			</div>
			<div className="action-list ts-card">
				{actions.map(([name, feature, status, duration]) => (
					<Button className="action-row" key={name} type="button">
						<span className="action-thumbnail">
							<span className="browser-chrome">
								<i />
								<i />
								<i />
							</span>
							<span className="action-play">
								<Glyph name="play" />
							</span>
						</span>
						<span className="action-copy">
							<strong>{name}</strong>
							<small>{feature} · Run #42</small>
						</span>
						<span
							className={`action-status${status === "Passed" ? "passed" : "attention"}`}
						>
							{status}
						</span>
						<span className="action-duration">
							<Glyph name="clock" />
							{duration}
						</span>
						<Glyph name="arrow-right" />
					</Button>
				))}
			</div>
		</div>
	);
}

function ReportView({
	project,
	tests,
	onOpenTest,
}: {
	project: Project;
	tests: TestCase[];
	onOpenTest(id: string): void;
}) {
	const attentionTest = tests.find((test) => test.status === "attention");
	return (
		<div className="project-tab-content">
			<div className="report-hero ts-card">
				<div className="report-score">
					<span className="score-ring">
						<strong>
							{Math.round((project.passed / Math.max(project.tests, 1)) * 100)}%
						</strong>
					</span>
					<div>
						<div className="eyebrow">Run #42 · {project.lastRun}</div>
						<h2>
							{project.status === "passed"
								? "Everything is green"
								: "A few flows need attention"}
						</h2>
						<p>
							{project.status === "passed"
								? "The latest run completed with no product failures."
								: "Ryu found an issue worth reviewing before calling this change done."}
						</p>
					</div>
				</div>
				<Button
					className="ts-btn ts-btn-primary"
					onClick={() => onOpenTest(attentionTest?.id ?? tests[0]?.id ?? "")}
					type="button"
				>
					Review report <Glyph name="arrow-right" />
				</Button>
			</div>
			<div className="report-columns">
				<Card className="ts-card failure-card">
					<CardHeader className="ts-card-header">
						<div>
							<CardTitle>Failure analysis</CardTitle>
							<CardDescription>Grouped by suspected cause</CardDescription>
						</div>
						<span className="failure-count">{project.attention}</span>
					</CardHeader>
					<CardContent>
						{tests
							.filter((test) => test.status === "attention")
							.map((test) => (
								<Button
									className="failure-row"
									key={test.id}
									onClick={() => onOpenTest(test.id)}
									type="button"
								>
									<span className="failure-icon">
										<Glyph name="alert" />
									</span>
									<span>
										<strong>{test.name}</strong>
										<small>
											Likely cause · billing provider response drift
										</small>
									</span>
									<Glyph name="arrow-right" />
								</Button>
							))}
						{project.attention === 0 ? (
							<div className="good-empty">
								<Glyph name="check" />
								No failures in the latest run.
							</div>
						) : null}
					</CardContent>
				</Card>
				<Card className="ts-card suggestion-card">
					<CardHeader className="ts-card-header">
						<div>
							<CardTitle>Suggested next step</CardTitle>
							<CardDescription>
								Ryu keeps the fix close to the evidence.
							</CardDescription>
						</div>
						<span className="suggestion-spark">✦</span>
					</CardHeader>
					<CardContent>
						<p>
							Re-run the checkout flow with the billing provider available, then
							keep the recovery assertion if the error state remains actionable.
						</p>
						<div className="suggestion-code">
							<span>Suggested fix</span>
							<code>
								expect(page.getByRole('button', {"{"} name: 'Try again' {"}"}
								)).toBeVisible()
							</code>
						</div>
						<Button
							className="ts-btn ts-btn-secondary ts-btn-full"
							type="button"
						>
							Copy suggested fix <Glyph name="copy" />
						</Button>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
