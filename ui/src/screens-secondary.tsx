import { Button } from "@ryu/ui/components/button.tsx";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ryu/ui/components/card.tsx";
import { Input } from "@ryu/ui/components/input.tsx";
import { Textarea } from "@ryu/ui/components/textarea.tsx";
import { useState } from "react";
import type { Project, Schedule, TestCase, TestList } from "./data.ts";

export { runtimeSelectionLabel } from "./runtime-selection.ts";

import { StatusBadge } from "./components.tsx";
import { Glyph, type IconName } from "./icons.tsx";
import type { Screen, SettingsSection } from "./screen-model.ts";
import { LogoMark, MetricCard, ScreenHeader } from "./screens-dashboard.tsx";
export function TestDetailPage({
	test,
	project,
	panel,
	onNavigate,
}: {
	test: TestCase;
	project: Project;
	panel: "preview" | "code";
	onNavigate(screen: Screen): void;
}) {
	const [leftTab, setLeftTab] = useState<"overview" | "chat">("overview");
	return (
		<div className="page-stack case-page">
			<div className="detail-breadcrumb">
				<Button
					onClick={() =>
						onNavigate({ kind: "project", id: project.id, tab: "tests" })
					}
					type="button"
				>
					{project.name}
				</Button>
				<Glyph name="arrow-right" />
				<span>{test.name}</span>
			</div>
			<div className="case-header">
				<div>
					<div className="eyebrow">
						{test.feature} · {test.type} test
					</div>
					<h1>{test.name}</h1>
					<p>
						Updated {test.updated} · {test.steps.length} steps · {test.priority}{" "}
						priority
					</p>
				</div>
				<div className="screen-actions">
					<Button className="ts-btn ts-btn-secondary" disabled type="button">
						<Glyph name="package" />
						Add to Test List unavailable
					</Button>
					<Button className="ts-btn ts-btn-primary" disabled type="button">
						<Glyph name="play" />
						Run unavailable
					</Button>
				</div>
			</div>
			<div className="case-workspace">
				<aside className="case-sidebar ts-card">
					<div className="case-panel-tabs" role="tablist">
						<Button
							aria-selected={leftTab === "overview"}
							className={leftTab === "overview" ? "is-selected" : ""}
							onClick={() => setLeftTab("overview")}
							role="tab"
							type="button"
						>
							Overview
						</Button>
						<Button
							aria-selected={leftTab === "chat"}
							className={leftTab === "chat" ? "is-selected" : ""}
							onClick={() => setLeftTab("chat")}
							role="tab"
							type="button"
						>
							Chat <span className="new-dot" />
						</Button>
					</div>
					{leftTab === "overview" ? (
						<div className="case-overview">
							<div className="case-section">
								<span className="case-section-label">Basics</span>
								<div className="case-meta-row">
									<span>Priority</span>
									<span
										className={`priority-pill${test.priority.toLowerCase()}`}
									>
										{test.priority}
									</span>
								</div>
								<div className="case-meta-row">
									<span>Status</span>
									<StatusBadge status={test.status} />
								</div>
								<div className="case-meta-row">
									<span>Feature</span>
									<strong>{test.feature}</strong>
								</div>
							</div>
							<div className="case-section">
								<span className="case-section-label">Test description</span>
								<p>{test.description}</p>
								<Button
									className="ts-btn ts-btn-ghost ts-btn-small"
									type="button"
								>
									Regenerate prompt
								</Button>
							</div>
							<div className="case-section">
								<span className="case-section-label">Terminal output</span>
								<pre className="terminal-output">
									{"No execution recorded\n" +
										test.steps.length +
										" planned steps\nRunner unavailable"}
								</pre>
							</div>
						</div>
					) : (
						<div className="case-chat">
							<div className="chat-message agent">
								<span className="chat-avatar">✦</span>
								<p>
									Test refinement will be available when the Ryu-native runner
									is connected.
								</p>
							</div>
							<div className="chat-suggestion">
								<span>Unavailable</span>
								<Button disabled type="button">
									Refinement unavailable
								</Button>
							</div>
							<Textarea
								className="ts-textarea chat-input"
								disabled
								placeholder="Describe a refinement…"
							/>
						</div>
					)}
				</aside>
				<section className="case-preview ts-card">
					<div className="case-preview-toolbar">
						<div className="preview-tabs" role="tablist">
							<Button
								aria-selected={panel === "preview"}
								className={panel === "preview" ? "is-selected" : ""}
								onClick={() =>
									onNavigate({
										kind: "test",
										projectId: project.id,
										testId: test.id,
										panel: "preview",
									})
								}
								role="tab"
								type="button"
							>
								Preview
							</Button>
							<Button
								aria-selected={panel === "code"}
								className={panel === "code" ? "is-selected" : ""}
								onClick={() =>
									onNavigate({
										kind: "test",
										projectId: project.id,
										testId: test.id,
										panel: "code",
									})
								}
								role="tab"
								type="button"
							>
								Code
							</Button>
						</div>
						<div className="preview-toolbar-actions">
							<span className="save-state">
								<span />
								Plan only
							</span>
							<Button
								className="ts-btn ts-btn-secondary ts-btn-small"
								disabled
								type="button"
							>
								Save & Run unavailable
							</Button>
						</div>
					</div>
					{panel === "preview" ? (
						<PreviewFrame test={test} />
					) : (
						<CodeFrame test={test} />
					)}
				</section>
			</div>
		</div>
	);
}

function PreviewFrame({ test }: { test: TestCase }) {
	const resultClass =
		test.status === "passed"
			? "passed"
			: test.status === "attention"
				? "attention"
				: "idle";
	const resultTitle =
		test.status === "passed"
			? "Flow passed"
			: test.status === "attention"
				? "Needs review"
				: "Not executed";
	return (
		<div className="preview-stage">
			<div className="preview-browser">
				<div className="preview-browser-top">
					<span />
					<span />
					<span />
					<div className="preview-url">
						{test.type === "API"
							? "api.ryuhq.com/v1/verify"
							: "store.ryuhq.com/dashboard"}
					</div>
				</div>
				<div className="preview-browser-body">
					<div className="preview-app-nav">
						<LogoMark />
						<span>Ryu</span>
						<span className="preview-nav-muted">Workspace</span>
					</div>
					<div className="preview-app-content">
						<div className="preview-app-heading">
							<span className="screen-skeleton short" />
							<span className="screen-skeleton tiny" />
						</div>
						<div className="preview-app-grid">
							<span className="preview-tile large" />
							<span className="preview-tile" />
							<span className="preview-tile" />
							<span className="preview-tile wide" />
						</div>
						<div className={`preview-result${resultClass}`}>
							<Glyph name={test.status === "passed" ? "check" : "activity"} />
							<div>
								<strong>{resultTitle}</strong>
								<small>{test.steps.at(-1)}</small>
							</div>
						</div>
					</div>
				</div>
			</div>
			<div className="preview-step-rail">
				<div className="eyebrow">Planned steps</div>
				{test.steps.map((step, index) => (
					<div className="preview-step" key={step}>
						<span>{index + 1}</span>
						<strong>{step}</strong>
						<Glyph name="activity" />
					</div>
				))}
			</div>
		</div>
	);
}

function CodeFrame({ test }: { test: TestCase }) {
	const code = [
		`test("${test.name}", async ({ page }) => {`,
		'  await page.goto("' +
			(test.type === "API"
				? "https://api.ryuhq.com/v1"
				: "https://store.ryuhq.com") +
			'");',
		...test.steps.map((step) => `  // ${step}`),
		"  await expect(page).toHaveScreenshot();",
		"});",
	].join("\n");
	return (
		<div className="code-stage">
			<div className="code-toolbar">
				<span>tests/{test.id}.spec.ts</span>
				<span>Playwright</span>
			</div>
			<pre>
				<code>{code}</code>
			</pre>
			<div className="code-note">
				<Glyph name="file" />
				<span>
					This source is a generated preview. Edit it in the Ryu-native runner
					when the integration is connected.
				</span>
			</div>
		</div>
	);
}

export function TestListsPage({
	lists,
	onCreate,
	onRun,
}: {
	lists: TestList[];
	onCreate(name: string): void;
	onRun(list: TestList): void;
}) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	return (
		<div className="page-stack">
			<ScreenHeader
				actions={
					<Button
						className="ts-btn ts-btn-primary"
						onClick={() => setOpen((value) => !value)}
						type="button"
					>
						<Glyph name="plus" />
						New list
					</Button>
				}
				description="Group planned tests together. Execution and scheduling are not connected yet."
				eyebrow="Collections"
				title="Test Lists"
			/>
			{open ? (
				<Card className="ts-card inline-create">
					<CardContent>
						<div>
							<div className="eyebrow">New test list</div>
							<h2>Give this collection a job</h2>
							<p>
								Use a name your team will recognize in a release note or
								schedule.
							</p>
						</div>
						<div className="inline-create-form">
							<Input
								aria-label="Test list name"
								className="ts-input"
								onChange={(event) => setName(event.target.value)}
								placeholder="e.g. Release gate"
								value={name}
							/>
							<Button
								className="ts-btn ts-btn-primary"
								disabled={name.trim().length === 0}
								onClick={() => {
									onCreate(name.trim());
									setName("");
									setOpen(false);
								}}
								type="button"
							>
								Create list
							</Button>
						</div>
					</CardContent>
				</Card>
			) : null}
			<div className="list-summary-grid">
				<MetricCard
					accent="green"
					helper="Collections ready to run"
					icon="package"
					label="Test lists"
					value={String(lists.length)}
				/>
				<MetricCard
					accent="blue"
					helper="UI and API coverage"
					icon="test"
					label="Tests grouped"
					value={String(
						lists.reduce(
							(total, list) => total + list.uiTests + list.apiTests,
							0
						)
					)}
				/>
				<MetricCard
					accent="amber"
					helper="Not connected"
					icon="clock"
					label="Scheduled"
					value="0"
				/>
			</div>
			<Card className="ts-card data-card">
				<div className="data-table-header">
					<span>Name</span>
					<span>Last execution</span>
					<span>Test cases</span>
					<span>Status</span>
					<span />
				</div>
				{lists.map((list) => (
					<div className="data-table-row" key={list.id}>
						<div className="data-primary">
							<span className="list-icon">
								<Glyph name="package" />
							</span>
							<span>
								<strong>{list.name}</strong>
								<small>{list.description}</small>
							</span>
						</div>
						<span>{list.lastRun}</span>
						<span>
							<strong>{list.uiTests + list.apiTests}</strong>
							<small>
								{list.uiTests} UI · {list.apiTests} API
							</small>
						</span>
						<StatusBadge status={list.status} />
						<div className="row-actions">
							<Button
								className="ts-btn ts-btn-secondary ts-btn-small"
								disabled
								onClick={() => onRun(list)}
								type="button"
							>
								Run unavailable
							</Button>
							<Button
								aria-label={`Open ${list.name}`}
								className="ts-btn ts-btn-icon ts-btn-ghost"
								disabled
								title="List execution is not connected"
								type="button"
							>
								<Glyph name="arrow-right" />
							</Button>
						</div>
					</div>
				))}
			</Card>
		</div>
	);
}

export function MonitoringPage({ schedules }: { schedules: Schedule[] }) {
	return (
		<div className="page-stack">
			<ScreenHeader
				actions={
					<Button className="ts-btn ts-btn-primary" disabled type="button">
						<Glyph name="plus" />
						New schedule unavailable
					</Button>
				}
				description="Scheduling is not connected in this planning preview."
				eyebrow="Collections"
				title="Monitoring"
			/>
			<div className="monitoring-banner">
				<div className="monitoring-art">
					<span />
					<span />
					<span />
					<span />
				</div>
				<div>
					<div className="eyebrow">Planned only</div>
					<h2>Scheduling is not connected.</h2>
					<p>
						The future runner will own recurring checks, verdicts, timing, and
						evidence. This preview does not start work after you close it.
					</p>
				</div>
				<div className="monitoring-banner-stat">
					<strong>{schedules.length}</strong>
					<span>active schedules</span>
				</div>
			</div>
			<div className="schedule-list">
				{schedules.map((schedule) => (
					<Card className="ts-card schedule-card" key={schedule.id}>
						<CardHeader className="ts-card-header">
							<div className="schedule-name">
								<span
									className={`schedule-icon${schedule.active ? "active" : ""}`}
								>
									<Glyph name="clock" />
								</span>
								<div>
									<CardTitle>{schedule.name}</CardTitle>
									<CardDescription>
										{schedule.listName} · {schedule.frequency}
									</CardDescription>
								</div>
							</div>
							<Button
								aria-pressed={schedule.active}
								className={`schedule-switch${schedule.active ? "is-on" : ""}`}
								disabled
								type="button"
							>
								<span />
							</Button>
						</CardHeader>
						<CardContent>
							<div className="schedule-meta">
								<div>
									<span>Next run</span>
									<strong>{schedule.nextRun}</strong>
								</div>
								<div>
									<span>Last result</span>
									<StatusBadge status={schedule.lastResult} />
								</div>
								<div>
									<span>Notifications</span>
									<strong>Ryu inbox</strong>
								</div>
							</div>
							<div className="schedule-actions">
								<Button
									className="ts-btn ts-btn-secondary ts-btn-small"
									disabled
									type="button"
								>
									Run now unavailable
								</Button>
								<Button
									className="ts-btn ts-btn-ghost ts-btn-small"
									disabled
									type="button"
								>
									Edit schedule unavailable
								</Button>
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}

export function SettingsPage({
	section,
	onNavigate,
}: {
	section: SettingsSection;
	onNavigate(screen: Screen): void;
}) {
	const sections: Array<{
		id: SettingsSection;
		label: string;
		icon: IconName;
		detail: string;
	}> = [
		{
			id: "api-keys",
			label: "API Keys",
			icon: "key",
			detail: "MCP and local tooling",
		},
		{
			id: "github",
			label: "GitHub App",
			icon: "github",
			detail: "PR verification",
		},
	];
	return (
		<div className="page-stack settings-page">
			<ScreenHeader
				description="Ryu keeps configuration close to the node that owns the work."
				eyebrow="Settings"
				title="Workspace settings"
			/>
			<div className="settings-layout">
				<nav aria-label="Settings sections" className="settings-nav">
					{sections.map((item) => (
						<Button
							className={section === item.id ? "is-selected" : ""}
							key={item.id}
							onClick={() => onNavigate({ kind: "settings", section: item.id })}
							type="button"
						>
							<span className="settings-nav-icon">
								<Glyph name={item.icon} />
							</span>
							<span>
								<strong>{item.label}</strong>
								<small>{item.detail}</small>
							</span>
							<Glyph name="arrow-right" />
						</Button>
					))}
				</nav>
				<div className="settings-content">
					{section === "api-keys" ? (
						<Card className="ts-card settings-card">
							<CardHeader className="ts-card-header">
								<div>
									<CardTitle>API Keys</CardTitle>
									<CardDescription>
										API-key management is not connected in this planning
										preview.
									</CardDescription>
								</div>
								<StatusBadge status="idle" />
							</CardHeader>
							<CardContent>
								<div className="key-callout">
									<span className="key-callout-icon">
										<Glyph name="key" />
									</span>
									<div>
										<strong>Not connected</strong>
										<p>
											The future runner will own key creation and secret storage
											through Ryu&apos;s permission boundary. No key exists from
											this preview.
										</p>
									</div>
								</div>
								<p className="settings-note">
									<Glyph name="key" />
									No external tooling can be connected from this surface yet.
								</p>
							</CardContent>
						</Card>
					) : null}
					{section === "github" ? (
						<Card className="ts-card settings-card">
							<CardHeader className="ts-card-header">
								<div>
									<CardTitle>GitHub App</CardTitle>
									<CardDescription>
										GitHub checks are not connected in this planning preview.
									</CardDescription>
								</div>
								<StatusBadge status="idle" />
							</CardHeader>
							<CardContent>
								<div className="github-connect">
									<span className="github-mark">
										<Glyph name="github" />
									</span>
									<div>
										<h2>Not connected</h2>
										<p>
											The node-owned GitHub bridge and PR runner have not been
											implemented. This screen cannot authorize an account.
										</p>
									</div>
									<Button
										className="ts-btn ts-btn-primary"
										disabled
										type="button"
									>
										Connect unavailable
									</Button>
								</div>
								<div className="settings-note">
									<Glyph name="git-branch" />
									<span>
										Run on PRs, include draft PRs, and block a merge when a
										selected list fails.
									</span>
								</div>
							</CardContent>
						</Card>
					) : null}
				</div>
			</div>
		</div>
	);
}
