import { RyuAppList, RyuAppListItem } from "@ryu/blocks/companion/app-ui";
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
import { Tabs, TabsList, TabsTrigger } from "@ryu/ui/components/tabs.tsx";
import styles from "./checks.module.css";
import {
	ChecksCard,
	EmptyState,
	StatusBadge,
	TypeBadge,
} from "./components.tsx";
import type { ChecksCoverageStyle } from "./coverage.ts";
import {
	type AgentRun,
	CHECKS_PREVIEW_NOTICE,
	type ExplorationRecord,
	type Project,
	projectStatusLabel,
	type TestCase,
	type TestRun,
	testsForProject,
} from "./data.ts";
import type { LoadEvidence } from "./evidence-viewer.tsx";
import { Glyph, type IconName } from "./icons.tsx";
import type { ProjectTab, Screen } from "./screen-model.ts";
import { ScreenHeader } from "./screens-dashboard.tsx";
import { ReportView } from "./screens-project-detail-report.tsx";
import {
	AgentActionsView,
	ExplorationView,
	RunHistoryView,
	TestCasesView,
} from "./screens-project-detail-tabs.tsx";

export function ProjectDetailPage({
	project,
	tests,
	tab,
	exploration,
	agentTranscript,
	agentRun,
	onExplore,
	onHealFailure,
	onLoadEvidence,
	onNavigate,
	onRun,
	run,
	runs,
}: {
	agentTranscript?: string;
	agentRun?: AgentRun;
	exploration?: ExplorationRecord;
	onHealFailure(runId: string, failureId: string): void;
	onLoadEvidence: LoadEvidence;
	project: Project;
	tests: TestCase[];
	tab: ProjectTab;
	onExplore(): void;
	onNavigate(screen: Screen): void;
	onRun(): void;
	run?: TestRun;
	runs: TestRun[];
}) {
	const tl = useLiteralMessages();
	const projectCoverage: ChecksCoverageStyle = {
		"--checks-coverage": `${project.coverage}%`,
	};
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
		<div className="page-stack">
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
				description={tl("{url} · Last run {lastRun}", {
					url: project.url,
					lastRun: project.lastRun,
				})}
				title={project.name}
			/>
			<div className="project-snapshot">
				<div>
					<span>Coverage</span>
					<strong>{project.coverage}%</strong>
					<div className="coverage-bar">
						<span className={styles.coverageFill} style={projectCoverage} />
					</div>
				</div>
				<div>
					<span>Latest verdict</span>
					<StatusBadge status={project.status} />
					<small>
						{tl("{passed} passed · {attention} attention", {
							passed: String(project.passed),
							attention: String(project.attention),
						})}
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
					onLoadEvidence={onLoadEvidence}
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
	const tl = useLiteralMessages();
	const highlightedTests = tests.slice(0, 3);
	const notRun = Math.max(
		0,
		project.tests - project.passed - project.attention
	);
	return (
		<div className="project-tab-content">
			<div className="flow-layout">
				<section className="flow-canvas">
					<div className="flow-canvas-header">
						<div>
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
								<small>
									{tl("{length} planned tests", {
										length: String(tests.length),
									})}
								</small>
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
				<Card>
					<CardHeader>
						<div>
							<CardTitle>Latest evidence</CardTitle>
							<CardDescription>No execution recorded</CardDescription>
						</div>
						<CardAction>
							<StatusBadge status="idle" />
						</CardAction>
					</CardHeader>
					<CardContent>
						<div className="flow-sidebar-content">
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
						</div>
					</CardContent>
				</Card>
			</div>
			<ChecksCard className="linked-tests">
				<CardHeader>
					<div>
						<CardTitle>Highlighted use cases</CardTitle>
						<CardDescription>
							Open a case to inspect its steps, replay, and generated source.
						</CardDescription>
					</div>
				</CardHeader>
				<CardContent>
					<RyuAppList aria-label="Highlighted use cases">
						{tests.slice(0, 3).map((test) => (
							<RyuAppListItem
								accessories={
									<>
										<TypeBadge type={test.type} />
										<Glyph name="arrow-right" />
									</>
								}
								icon={
									<span className={`run-icon${test.status}`}>
										<Glyph
											name={test.status === "passed" ? "check" : "activity"}
										/>
									</span>
								}
								key={test.id}
								onClick={() => onOpenTest(test.id)}
								subtitle={tl("{feature} · {length} steps", {
									feature: test.feature,
									length: String(test.steps.length),
								})}
								title={test.name}
							/>
						))}
					</RyuAppList>
				</CardContent>
			</ChecksCard>
		</div>
	);
}
