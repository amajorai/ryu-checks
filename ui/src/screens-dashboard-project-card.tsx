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
import styles from "./checks.module.css";
import { StatusBadge } from "./components.tsx";
import type { ChecksCoverageStyle } from "./coverage.ts";
import { type Project, typeClass } from "./data.ts";
import { Glyph } from "./icons.tsx";
import { ProjectCardStats } from "./project-card-stats.tsx";
import { lastRunText } from "./run-time-label.ts";
import { runtimeSelectionLabel } from "./runtime-selection.ts";

export function ProjectCard({
	project,
	lastRunAt,
	onOpen,
	onRun,
}: {
	project: Project;
	/** When the project last ran (see `projectLastRunAt`). */
	lastRunAt?: string | null;
	onOpen(): void;
	onRun(): void;
}) {
	const tl = useLiteralMessages();
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
					<ProjectCardStats
						coverage={project.coverage}
						passed={project.passed}
						tests={project.tests}
					/>
					<div className="coverage-bar">
						<span className={styles.coverageFill} style={projectCoverage} />
					</div>
					<div className="project-card-footer">
						<span className={`type-badge ${typeClass(project.type)}`}>
							{project.type === "Mixed"
								? "UI + API"
								: tl("{type} tests", { type: project.type })}
						</span>
						<span className="last-run">
							{runtimeSelectionLabel(project.runtimeSelection)}
						</span>
						<span className="last-run">
							{tl("Last run {lastRun}", {
								lastRun: lastRunText(project.lastRun, lastRunAt),
							})}
						</span>
					</div>
					<div className="card-actions">
						<Button onClick={onOpen} size="sm" type="button" variant="outline">
							Open project <Glyph name="arrow-right" />
						</Button>
						<Button
							aria-label={tl("Run {name}", { name: project.name })}
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
