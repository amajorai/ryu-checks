import { RyuAppList, RyuAppListItem } from "@ryu/blocks/companion/app-ui";
import { Button } from "@ryu/ui/components/button.tsx";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ryu/ui/components/card.tsx";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@ryu/ui/components/dropdown-menu.tsx";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@ryu/ui/components/input-group.tsx";
import { Tabs, TabsList, TabsTrigger } from "@ryu/ui/components/tabs.tsx";
import { formatTime } from "@ryu/ui/lib/timezone.ts";
import { type ReactNode, useMemo, useState } from "react";
import styles from "./checks.module.css";
import { EmptyState, StatusBadge } from "./components.tsx";
import type { ChecksCoverageStyle } from "./coverage.ts";
import {
	type Analytics,
	CHECKS_PREVIEW_NOTICE,
	filteredProjects,
	overallCoverage,
	type Project,
	projectStatusLabel,
	type TestRun,
	typeClass,
} from "./data.ts";
import { Glyph, type IconName } from "./icons.tsx";
import { runtimeSelectionLabel } from "./runtime-selection.ts";
import type { Screen, TestFilter } from "./screen-model.ts";

const PROJECT_STATUS_FILTERS = [
	"All statuses",
	"Passed",
	"Needs attention",
	"Running",
	"Ready to run",
] as const;

type ProjectStatusFilter = (typeof PROJECT_STATUS_FILTERS)[number];

function isProjectStatusFilter(
	value: string | null
): value is ProjectStatusFilter {
	return (
		value !== null && PROJECT_STATUS_FILTERS.some((filter) => filter === value)
	);
}

export function LogoMark() {
	return (
		<div aria-hidden="true" className="logo-mark">
			<span />
			<span />
			<span />
		</div>
	);
}

export function ScreenHeader({
	title,
	description,
	actions,
}: {
	title: string;
	description?: string;
	actions?: ReactNode;
}) {
	return (
		<div className="screen-header">
			<div>
				<h1>{title}</h1>
				{description ? <p>{description}</p> : null}
			</div>
			{actions ? <div className="screen-actions">{actions}</div> : null}
		</div>
	);
}

export function MetricCard({
	icon,
	label,
	value,
	helper,
	accent = "green",
}: {
	icon: IconName;
	label: string;
	value: string;
	helper: string;
	accent?: "green" | "amber" | "blue";
}) {
	return (
		<div className={`metric-card metric-${accent}`}>
			<Card>
				<CardContent className="h-full">
					<div className="metric-icon">
						<Glyph name={icon} />
					</div>
					<div className="metric-label">{label}</div>
					<strong className="metric-value">{value}</strong>
					<div className="metric-helper">{helper}</div>
				</CardContent>
			</Card>
		</div>
	);
}

export function HomePage({
	analytics,
	projects,
	onNavigate,
	runs,
}: {
	analytics: Analytics | null;
	projects: Project[];
	onNavigate(screen: Screen): void;
	runs: TestRun[];
}) {
	const coverage = overallCoverage(projects);
	const totalTests = projects.reduce(
		(total, project) => total + project.tests,
		0
	);
	const attention = projects.reduce(
		(total, project) => total + project.attention,
		0
	);
	const recentRuns = runs.slice(0, 3);
	return (
		<div className="page-stack">
			<ScreenHeader
				actions={
					<Button
						onClick={() => onNavigate({ kind: "create-tests", step: 0 })}
						size="default"
						type="button"
						variant="default"
					>
						<Glyph name="plus" />
						Create Tests
					</Button>
				}
				description="Plan, explore, run, and retain evidence for every change."
				title="Home"
			/>
			<div className="metric-grid">
				<MetricCard
					accent="green"
					helper="Persisted on this node"
					icon="folder"
					label="Planned projects"
					value={String(projects.length)}
				/>
				<MetricCard
					accent="blue"
					helper={`${String(attention)} failure bundles need a closer look`}
					icon="test"
					label="Planned test cases"
					value={String(totalTests)}
				/>
				<MetricCard
					accent="amber"
					helper={`${analytics?.runs ?? 0} retained run${analytics?.runs === 1 ? "" : "s"}`}
					icon="activity"
					label="Observed coverage"
					value={`${coverage}%`}
				/>
			</div>
			<div className="home-columns">
				<Card>
					<CardHeader>
						<div>
							<CardTitle>Recent runs</CardTitle>
							<CardDescription>
								Every verdict stays attached to the change that produced it.
							</CardDescription>
						</div>
						<CardAction>
							<Button
								onClick={() => onNavigate({ kind: "all-tests", filter: "All" })}
								size="sm"
								type="button"
								variant="ghost"
							>
								See all
							</Button>
						</CardAction>
					</CardHeader>
					<CardContent>
						{recentRuns.length > 0 ? (
							<RyuAppList aria-label="Recent runs">
								{recentRuns.map((run) => {
									const project = projects.find(
										(item) => item.id === run.projectId
									);
									if (!project) {
										return null;
									}
									return (
										<RyuAppListItem
											accessories={
												<>
													<span className="run-time">
														{formatTime(run.finishedAt, {
															hour: "2-digit",
															minute: "2-digit",
														})}
													</span>
													<Glyph name="arrow-right" />
												</>
											}
											icon={
												<span
													className={`run-icon${run.failed === 0 ? "passed" : "attention"}`}
												>
													<Glyph
														name={run.failed === 0 ? "check" : "activity"}
													/>
												</span>
											}
											key={run.id}
											onClick={() =>
												onNavigate({
													kind: "project",
													id: run.projectId,
													tab: "tests",
												})
											}
											subtitle={`${run.passed} passed · ${run.failed} attention · ${run.evidenceLevel}`}
											title={project.name}
										/>
									);
								})}
							</RyuAppList>
						) : (
							<EmptyState
								detail="Run a project to attach live evidence to this workspace."
								title="No runs yet"
							/>
						)}
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<div>
							<CardTitle>Runner status</CardTitle>
							<CardDescription>Node-local runner is ready</CardDescription>
						</div>
						<CardAction>
							<StatusBadge status="passed" />
						</CardAction>
					</CardHeader>
					<CardContent>
						<p className="next-run-meta">{CHECKS_PREVIEW_NOTICE}</p>
						<div className="mini-steps">
							<div className="mini-step">
								<span>1</span>
								<div>
									<strong>Plan</strong>
									<small>Define the flow and assertions</small>
								</div>
							</div>
							<div className="mini-step">
								<span>2</span>
								<div>
									<strong>Explore</strong>
									<small>Map feature signals on the live target</small>
								</div>
							</div>
							<div className="mini-step">
								<span>3</span>
								<div>
									<strong>Verify</strong>
									<small>Keep verdicts and failure bundles</small>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

export function AllTestsPage({
	projects,
	screen,
	onNavigate,
	onRunProject,
}: {
	projects: Project[];
	screen: Extract<Screen, { kind: "all-tests" }>;
	onNavigate(screen: Screen): void;
	onRunProject(id: string): void;
}) {
	const [query, setQuery] = useState("");
	const [statusFilter, setStatusFilter] =
		useState<ProjectStatusFilter>("All statuses");
	const [filterMenuOpen, setFilterMenuOpen] = useState(false);
	const visible = useMemo(
		() =>
			filteredProjects(projects, query, screen.filter).filter(
				(project) =>
					statusFilter === "All statuses" ||
					projectStatusLabel(project.status) === statusFilter
			),
		[projects, query, screen.filter, statusFilter]
	);
	return (
		<div className="page-stack">
			<ScreenHeader
				actions={
					<Button
						onClick={() => onNavigate({ kind: "create-tests", step: 0 })}
						size="default"
						type="button"
						variant="default"
					>
						<Glyph name="plus" />
						New project
					</Button>
				}
				description="Your projects, grouped by what they verify."
				title="All Tests"
			/>
			<div className="toolbar-row">
				<Tabs
					onValueChange={(value) => {
						if (value === "All" || value === "UI" || value === "API") {
							onNavigate({ kind: "all-tests", filter: value });
						}
					}}
					value={screen.filter}
				>
					<TabsList variant="line">
						{(["All", "UI", "API"] satisfies TestFilter[]).map((filter) => (
							<TabsTrigger key={filter} value={filter}>
								{filter === "All" ? "All projects" : `${filter} tests`}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
				<div className="toolbar-tools">
					<div className="w-full sm:max-w-64">
						<InputGroup>
							<InputGroupAddon>
								<Glyph name="search" />
							</InputGroupAddon>
							<InputGroupInput
								aria-label="Search projects"
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Search projects"
								value={query}
							/>
						</InputGroup>
					</div>
					<DropdownMenu onOpenChange={setFilterMenuOpen} open={filterMenuOpen}>
						<DropdownMenuTrigger
							render={
								<Button
									aria-label={`Filter projects: ${statusFilter}`}
									aria-pressed={statusFilter !== "All statuses"}
									size={statusFilter === "All statuses" ? "icon-sm" : "sm"}
									type="button"
									variant={
										statusFilter === "All statuses" ? "outline" : "secondary"
									}
								/>
							}
						>
							<Glyph name="filter" />
							{statusFilter === "All statuses" ? null : statusFilter}
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuRadioGroup
								onValueChange={(value) => {
									if (isProjectStatusFilter(value)) {
										setStatusFilter(value);
										setFilterMenuOpen(false);
									}
								}}
								value={statusFilter}
							>
								<DropdownMenuLabel>Status</DropdownMenuLabel>
								{PROJECT_STATUS_FILTERS.map((filter) => (
									<DropdownMenuRadioItem key={filter} value={filter}>
										{filter}
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
			<div className="project-grid">
				{visible.map((project) => (
					<ProjectCard
						key={project.id}
						onOpen={() =>
							onNavigate({ kind: "project", id: project.id, tab: "flow" })
						}
						onRun={() => onRunProject(project.id)}
						project={project}
					/>
				))}
			</div>
			{visible.length === 0 ? (
				<EmptyState
					detail="Try a different name, test type, or status."
					title="No projects found"
				/>
			) : null}
		</div>
	);
}

export function ProjectCard({
	project,
	onOpen,
	onRun,
}: {
	project: Project;
	onOpen(): void;
	onRun(): void;
}) {
	const projectCoverage: ChecksCoverageStyle = {
		"--checks-coverage": `${project.coverage}%`,
	};
	return (
		<div className="project-card">
			<Card>
				<CardHeader>
					<div className="project-card-title">
						<div className="project-icon">
							<Glyph name={project.type === "API" ? "api" : "test"} />
						</div>
						<div>
							<CardTitle>{project.name}</CardTitle>
							<CardDescription>{project.url}</CardDescription>
						</div>
					</div>
					<CardAction>
						<StatusBadge status={project.status} />
					</CardAction>
				</CardHeader>
				<CardContent>
					<p className="project-description">{project.description}</p>
					<div className="project-card-stats">
						<span>
							<strong>{project.tests}</strong> tests
						</span>
						<span>
							<strong>{project.passed}</strong> passed
						</span>
						<span>
							<strong>{project.coverage}%</strong> coverage
						</span>
					</div>
					<div className="coverage-bar">
						<span className={styles.coverageFill} style={projectCoverage} />
					</div>
					<div className="project-card-footer">
						<span className={`type-badge${typeClass(project.type)}`}>
							{project.type === "Mixed" ? "UI + API" : `${project.type} tests`}
						</span>
						<span className="last-run">
							{runtimeSelectionLabel(project.runtimeSelection)}
						</span>
						<span className="last-run">Last run {project.lastRun}</span>
					</div>
					<div className="card-actions">
						<Button onClick={onOpen} size="sm" type="button" variant="outline">
							Open project <Glyph name="arrow-right" />
						</Button>
						<Button
							aria-label={`Run ${project.name}`}
							onClick={onRun}
							size="icon-sm"
							title="Run live checks"
							type="button"
							variant="ghost"
						>
							<Glyph name="play" />
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
