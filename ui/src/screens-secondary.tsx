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
	onNotify,
}: {
	test: TestCase;
	project: Project;
	panel: "preview" | "code";
	onNavigate(screen: Screen): void;
	onNotify(message: string): void;
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
					<Button
						className="ts-btn ts-btn-secondary"
						onClick={() => onNotify("Test added to Release gate")}
						type="button"
					>
						<Glyph name="package" />
						Add to Test List
					</Button>
					<Button
						className="ts-btn ts-btn-primary"
						onClick={() => onNotify("Test run started")}
						type="button"
					>
						<Glyph name="play" />
						Run
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
									{"✓ session established\n✓ " +
										test.steps.length +
										" steps replayed\n" +
										(test.status === "passed"
											? "✓ assertions passed"
											: "! recovery assertion needs review")}
								</pre>
							</div>
						</div>
					) : (
						<div className="case-chat">
							<div className="chat-message agent">
								<span className="chat-avatar">✦</span>
								<p>
									Tell me what you want to change in this test. I can tighten
									the intent, add a step, or explain the latest failure.
								</p>
							</div>
							<div className="chat-suggestion">
								<span>Try asking</span>
								<Button
									onClick={() => onNotify("Refinement queued locally")}
									type="button"
								>
									“Add a screenshot after checkout fails”
								</Button>
							</div>
							<Textarea
								className="ts-textarea chat-input"
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
								Saved
							</span>
							<Button
								className="ts-btn ts-btn-secondary ts-btn-small"
								onClick={() => onNotify("Saved and queued a rerun")}
								type="button"
							>
								Save & Run
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
						<div
							className={
								"preview-result" +
								(test.status === "passed" ? "passed" : "attention")
							}
						>
							<Glyph name={test.status === "passed" ? "check" : "activity"} />
							<div>
								<strong>
									{test.status === "passed"
										? "Flow completed"
										: "Recovery state captured"}
								</strong>
								<small>{test.steps.at(-1)}</small>
							</div>
						</div>
					</div>
				</div>
			</div>
			<div className="preview-step-rail">
				<div className="eyebrow">Step-by-step replay</div>
				{test.steps.map((step, index) => (
					<div className="preview-step" key={step}>
						<span>{index + 1}</span>
						<strong>{step}</strong>
						<Glyph name="check" />
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
				description="Group the tests that matter together, then run or schedule them as one unit."
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
					helper="Monitoring active"
					icon="clock"
					label="Scheduled"
					value="2"
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
								onClick={() => onRun(list)}
								type="button"
							>
								<Glyph name="play" />
								Run
							</Button>
							<Button
								aria-label={`Open ${list.name}`}
								className="ts-btn ts-btn-icon ts-btn-ghost"
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

export function MonitoringPage({
	schedules,
	onToggle,
	onRun,
}: {
	schedules: Schedule[];
	onToggle(id: string): void;
	onRun(schedule: Schedule): void;
}) {
	return (
		<div className="page-stack">
			<ScreenHeader
				actions={
					<Button className="ts-btn ts-btn-primary" type="button">
						<Glyph name="plus" />
						New schedule
					</Button>
				}
				description="Keep your release confidence running after you close the tab."
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
					<div className="eyebrow">Always on</div>
					<h2>Find regressions before your users do.</h2>
					<p>
						Schedules run a Test List on a cadence and keep the verdict, timing,
						and evidence attached to every execution.
					</p>
				</div>
				<div className="monitoring-banner-stat">
					<strong>2</strong>
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
								className={`fake-switch${schedule.active ? "is-on" : ""}`}
								onClick={() => onToggle(schedule.id)}
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
									onClick={() => onRun(schedule)}
									type="button"
								>
									<Glyph name="play" />
									Run now
								</Button>
								<Button
									className="ts-btn ts-btn-ghost ts-btn-small"
									type="button"
								>
									Edit schedule <Glyph name="arrow-right" />
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
	onNotify,
}: {
	section: SettingsSection;
	onNavigate(screen: Screen): void;
	onNotify(message: string): void;
}) {
	const [connected, setConnected] = useState(false);
	const [keyCreated, setKeyCreated] = useState(false);
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
										Keys for Ryu-native MCP and external tooling. Secrets never
										appear in this surface.
									</CardDescription>
								</div>
								<Button
									className="ts-btn ts-btn-primary ts-btn-small"
									onClick={() => {
										setKeyCreated(true);
										onNotify("Local API key created");
									}}
									type="button"
								>
									<Glyph name="plus" />
									New API key
								</Button>
							</CardHeader>
							<CardContent>
								<div className="key-callout">
									<span className="key-callout-icon">
										<Glyph name="key" />
									</span>
									<div>
										<strong>Local by default</strong>
										<p>
											This app is local-first. A future Ryu runner can use these
											keys through the node permission boundary.
										</p>
									</div>
								</div>
								<div className="key-row">
									<span className="key-status">
										<span />
										Active
									</span>
									<span>
										<strong>
											{keyCreated ? "Ryu local key" : "Workspace MCP key"}
										</strong>
										<small>
											{keyCreated ? "Created just now" : "Created 3 days ago"}
										</small>
									</span>
									<code>[REDACTED_SECRET]</code>
									<Button
										className="ts-btn ts-btn-icon ts-btn-ghost"
										onClick={() =>
											onNotify("Secret values stay redacted in the UI")
										}
										type="button"
									>
										<Glyph name="copy" />
									</Button>
								</div>
							</CardContent>
						</Card>
					) : null}
					{section === "github" ? (
						<Card className="ts-card settings-card">
							<CardHeader className="ts-card-header">
								<div>
									<CardTitle>GitHub App</CardTitle>
									<CardDescription>
										Connect pull requests to a Test List without moving
										credentials into the companion.
									</CardDescription>
								</div>
								<StatusBadge status={connected ? "passed" : "idle"} />
							</CardHeader>
							<CardContent>
								<div className="github-connect">
									<span className="github-mark">
										<Glyph name="github" />
									</span>
									<div>
										<h2>
											{connected
												? "Ryu GitHub bridge connected"
												: "Connect your GitHub workspace"}
										</h2>
										<p>
											{connected
												? "PR checks are ready to use through Ryu's authenticated GitHub seam."
												: "The local app is ready for a node-owned integration. No external account or API is used."}
										</p>
									</div>
									<Button
										className="ts-btn ts-btn-primary"
										onClick={() => {
											setConnected((value) => !value);
											onNotify(
												connected
													? "GitHub bridge disconnected"
													: "GitHub bridge connected locally"
											);
										}}
										type="button"
									>
										{connected ? "Disconnect" : "Connect locally"}
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
