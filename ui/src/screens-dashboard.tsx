import { Button } from "@ryu/ui/components/button.tsx";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ryu/ui/components/card.tsx";
import { Input } from "@ryu/ui/components/input.tsx";
import { type ReactNode, useMemo, useState } from "react";
import { EmptyState, StatusBadge } from "./components.tsx";
import {
	CHECKS_PREVIEW_NOTICE,
	filteredProjects,
	overallCoverage,
	type Project,
	type RunStatus,
	typeClass,
} from "./data.ts";
import { Glyph, type IconName } from "./icons.tsx";
import { runtimeSelectionLabel } from "./runtime-selection.ts";
import type { Screen, TestFilter } from "./screen-model.ts";

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
	eyebrow,
	title,
	description,
	actions,
}: {
	eyebrow?: string;
	title: string;
	description?: string;
	actions?: ReactNode;
}) {
	return (
		<div className="screen-header">
			<div>
				{eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
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
		<Card className={`ts-card metric-card metric-${accent}`}>
			<CardContent>
				<div className="metric-icon">
					<Glyph name={icon} />
				</div>
				<div className="metric-label">{label}</div>
				<strong className="metric-value">{value}</strong>
				<div className="metric-helper">{helper}</div>
			</CardContent>
		</Card>
	);
}

export function HomePage({
	projects,
	onNavigate,
}: {
	projects: Project[];
	onNavigate(screen: Screen): void;
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
	const recentRuns = projects.filter(
		(project) => project.status !== "idle" && project.lastRun !== "Not run"
	);
	return (
		<div className="page-stack home-page">
			<ScreenHeader
				actions={
					<Button
						className="ts-btn ts-btn-primary"
						onClick={() => onNavigate({ kind: "create-tests", step: 0 })}
						type="button"
					>
						<Glyph name="plus" />
						Create Tests
					</Button>
				}
				description="A planning view of the verification work you want to prove."
				eyebrow="Ryu verification workspace"
				title="Home"
			/>
			<div className="metric-grid">
				<MetricCard
					accent="green"
					helper="Plans saved in this workspace"
					icon="folder"
					label="Planned projects"
					value={String(projects.length)}
				/>
				<MetricCard
					accent="blue"
					helper={`${String(attention)} need a closer look`}
					icon="test"
					label="Planned test cases"
					value={String(totalTests)}
				/>
				<MetricCard
					accent="amber"
					helper="No runner connected"
					icon="activity"
					label="Observed coverage"
					value={`${coverage}%`}
				/>
			</div>
			<div className="home-columns">
				<Card className="ts-card activity-card">
					<CardHeader className="ts-card-header">
						<div>
							<CardTitle>Recent runs</CardTitle>
							<CardDescription>
								Every verdict stays attached to the change that produced it.
							</CardDescription>
						</div>
						<Button
							className="ts-btn ts-btn-ghost ts-btn-small"
							onClick={() => onNavigate({ kind: "all-tests", filter: "All" })}
							type="button"
						>
							See all
						</Button>
					</CardHeader>
					<CardContent className="activity-list">
						{recentRuns.length > 0 ? (
							recentRuns.slice(0, 3).map((project) => (
								<RunRow
									detail={`${project.tests} planned test${project.tests === 1 ? "" : "s"}`}
									key={project.id}
									onClick={() =>
										onNavigate({
											kind: "project",
											id: project.id,
											tab: "tests",
										})
									}
									project={project.name}
									status={project.status}
									time={project.lastRun}
								/>
							))
						) : (
							<EmptyState
								detail={CHECKS_PREVIEW_NOTICE}
								title="No executions yet"
							/>
						)}
					</CardContent>
				</Card>
				<Card className="ts-card next-run-card">
					<CardHeader className="ts-card-header">
						<div>
							<CardTitle>Runner status</CardTitle>
							<CardDescription>Execution is not connected</CardDescription>
						</div>
						<StatusBadge status="idle" />
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
									<strong>Connect</strong>
									<small>Add a Ryu-native runner</small>
								</div>
							</div>
							<div className="mini-step">
								<span>3</span>
								<div>
									<strong>Verify</strong>
									<small>Collect live evidence</small>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

function RunRow({
	project,
	detail,
	time,
	status,
	onClick,
}: {
	project: string;
	detail: string;
	time: string;
	status: RunStatus;
	onClick(): void;
}) {
	return (
		<Button className="run-row" onClick={onClick} type="button">
			<span className={`run-icon${status}`}>
				<Glyph name={status === "passed" ? "check" : "activity"} />
			</span>
			<span className="run-copy">
				<strong>{project}</strong>
				<small>{detail}</small>
			</span>
			<span className="run-time">{time}</span>
			<Glyph className="run-arrow" name="arrow-right" />
		</Button>
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
	const visible = useMemo(
		() => filteredProjects(projects, query, screen.filter),
		[projects, query, screen.filter]
	);
	return (
		<div className="page-stack">
			<ScreenHeader
				actions={
					<Button
						className="ts-btn ts-btn-primary"
						onClick={() => onNavigate({ kind: "create-tests", step: 0 })}
						type="button"
					>
						<Glyph name="plus" />
						New project
					</Button>
				}
				description="Your projects, grouped by what they verify."
				eyebrow="Testing"
				title="All Tests"
			/>
			<div className="toolbar-row">
				<div
					aria-label="Test type filter"
					className="segmented-control"
					role="tablist"
				>
					{(["All", "UI", "API"] as TestFilter[]).map((filter) => (
						<Button
							aria-selected={screen.filter === filter}
							className={screen.filter === filter ? "is-selected" : ""}
							key={filter}
							onClick={() => onNavigate({ kind: "all-tests", filter })}
							role="tab"
							type="button"
						>
							{filter === "All" ? "All projects" : `${filter} tests`}
						</Button>
					))}
				</div>
				<div className="toolbar-tools">
					<label className="search-field">
						<Glyph name="search" />
						<Input
							aria-label="Search projects"
							className="ts-input"
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search projects"
							value={query}
						/>
					</label>
					<Button className="ts-btn ts-btn-icon ts-btn-secondary" type="button">
						<Glyph name="filter" />
					</Button>
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
					detail="Try a different name or test type."
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
	return (
		<Card className="ts-card project-card">
			<CardHeader className="ts-card-header">
				<div className="project-card-title">
					<div className="project-icon">
						<Glyph name={project.type === "API" ? "api" : "test"} />
					</div>
					<div>
						<CardTitle>{project.name}</CardTitle>
						<CardDescription>{project.url}</CardDescription>
					</div>
				</div>
				<StatusBadge status={project.status} />
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
					<span style={{ width: `${project.coverage}%` }} />
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
					<Button
						className="ts-btn ts-btn-secondary ts-btn-small"
						onClick={onOpen}
						type="button"
					>
						Open project <Glyph name="arrow-right" />
					</Button>
					<Button
						aria-label={`Run ${project.name}`}
						className="ts-btn ts-btn-icon ts-btn-ghost"
						disabled
						onClick={onRun}
						title="Test runner is not connected"
						type="button"
					>
						<Glyph name="play" />
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
