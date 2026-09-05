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
	CHECKS_PREVIEW_NOTICE,
	type Project,
	projectStatusLabel,
	type TestCase,
	testsForProject,
} from "./data.ts";
import { Glyph, type IconName } from "./icons.tsx";
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
							Open test lists
						</Button>
						<Button
							className="ts-btn ts-btn-primary"
							disabled
							onClick={onRun}
							type="button"
						>
							Run project unavailable
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
					<strong>Not connected</strong>
					<small>Test-account setup belongs to the future runner</small>
				</div>
				<div>
					<span>Next run</span>
					<strong>Not scheduled</strong>
					<small>Monitoring is not connected</small>
				</div>
				<div>
					<span>Execution lane</span>
					<strong>Not connected</strong>
					<small>{CHECKS_PREVIEW_NOTICE}</small>
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
				<ReportView project={project} tests={projectTests} />
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
								Execution evidence will appear after a Ryu-native runner is
								connected.
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
	return (
		<div className="project-tab-content">
			<div className="exploration-header">
				<div>
					<div className="eyebrow">Not connected</div>
					<h2>Site exploration</h2>
					<p>
						The explorer is not connected, so this project has no observed flows
						or recordings yet.
					</p>
				</div>
				<Button className="ts-btn ts-btn-secondary" disabled type="button">
					Explore unavailable
				</Button>
			</div>
			<EmptyState
				detail={`The target ${project.url} is stored as planning context only. No network request or browser session has been run.`}
				title="No exploration evidence"
			/>
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
				<Button className="ts-btn ts-btn-secondary" disabled type="button">
					<Glyph name="plus" />
					Add test unavailable
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

function AgentActionsView() {
	return (
		<div className="project-tab-content">
			<div className="exploration-header">
				<div>
					<div className="eyebrow">Not connected</div>
					<h2>Agent actions</h2>
					<p>
						The agent runner is not connected, so there are no replayable
						actions to show.
					</p>
				</div>
				<span className="recording-note">Runner unavailable</span>
			</div>
			<EmptyState
				detail="Connect a Ryu-native runner before recording agent actions."
				title="No agent evidence"
			/>
		</div>
	);
}

function ReportView({
	project,
	tests,
}: {
	project: Project;
	tests: TestCase[];
}) {
	return (
		<div className="project-tab-content">
			<div className="report-hero ts-card">
				<div className="report-score">
					<span className="score-ring">
						<strong>—</strong>
					</span>
					<div>
						<div className="eyebrow">No run recorded</div>
						<h2>Evidence will appear after execution.</h2>
						<p>
							This project has {tests.length} planned case
							{tests.length === 1 ? "" : "s"}, but no connected runner has
							produced a verdict.
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
							<CardDescription>Unavailable before a real run</CardDescription>
						</div>
						<span className="failure-count">—</span>
					</CardHeader>
					<CardContent>
						<EmptyState
							detail="A runner must execute the planned cases before failure analysis is meaningful."
							title="No failure evidence"
						/>
					</CardContent>
				</Card>
				<Card className="ts-card suggestion-card">
					<CardHeader className="ts-card-header">
						<div>
							<CardTitle>Next step</CardTitle>
							<CardDescription>
								Connect the missing execution seam
							</CardDescription>
						</div>
						<span className="suggestion-spark">✦</span>
					</CardHeader>
					<CardContent>
						<p>
							The project can hold a plan, but this build cannot explore a site,
							drive an agent, or collect assertions.
						</p>
						<Button
							className="ts-btn ts-btn-secondary ts-btn-full"
							disabled
							type="button"
						>
							Runner setup unavailable
						</Button>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
