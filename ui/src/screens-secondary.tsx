import { Button } from "@ryu/ui/components/button.tsx";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ryu/ui/components/card.tsx";
import { Checkbox } from "@ryu/ui/components/checkbox.tsx";
import { Input } from "@ryu/ui/components/input.tsx";
import { Tabs, TabsList, TabsTrigger } from "@ryu/ui/components/tabs.tsx";
import { Textarea } from "@ryu/ui/components/textarea.tsx";
import { useState } from "react";
import type { Project, Schedule, TestCase, TestList, TestRun } from "./data.ts";

export { runtimeSelectionLabel } from "./runtime-selection.ts";

import { StatusBadge } from "./components.tsx";
import { Glyph, type IconName } from "./icons.tsx";
import type { Screen, SettingsSection } from "./screen-model.ts";
import { LogoMark, MetricCard, ScreenHeader } from "./screens-dashboard.tsx";
export function TestDetailPage({
	test,
	project,
	panel,
	run,
	onRun,
	onRunProject,
	onNavigate,
	onUpdateTest,
}: {
	test: TestCase;
	project: Project;
	panel: "preview" | "code";
	run?: TestRun;
	onRun(): void;
	onRunProject(): void;
	onNavigate(screen: Screen): void;
	onUpdateTest(
		testId: string,
		input: {
			description?: string;
			priority?: "High" | "Medium" | "Low";
			steps?: string[];
			requestMethod?: string;
			requestPath?: string;
			expectedStatus?: number;
			responseAssertions?: string[];
			maxResponseTimeMs?: number;
		}
	): Promise<void>;
}) {
	const [leftTab, setLeftTab] = useState<"overview" | "chat">("overview");
	const [editing, setEditing] = useState(false);
	const [description, setDescription] = useState(test.description);
	const [steps, setSteps] = useState(test.steps.join("\n"));
	const [requestMethod, setRequestMethod] = useState(
		test.requestMethod ?? "GET"
	);
	const [requestPath, setRequestPath] = useState(test.requestPath ?? "");
	const [expectedStatus, setExpectedStatus] = useState(
		String(test.expectedStatus ?? 200)
	);
	const [responseAssertions, setResponseAssertions] = useState(
		(test.responseAssertions ?? []).join("\n")
	);
	const [maxResponseTime, setMaxResponseTime] = useState(
		String(test.maxResponseTimeMs ?? "")
	);
	const savePlan = async () => {
		await onUpdateTest(test.id, {
			description,
			expectedStatus: Number(expectedStatus) || 200,
			requestMethod,
			requestPath,
			responseAssertions: responseAssertions.split("\n"),
			maxResponseTimeMs: Number(maxResponseTime) || undefined,
			steps: steps.split("\n"),
		});
		setEditing(false);
	};
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
						onClick={() => {
							if (editing) {
								void savePlan();
								return;
							}
							setDescription(test.description);
							setSteps(test.steps.join("\n"));
							setRequestMethod(test.requestMethod ?? "GET");
							setRequestPath(test.requestPath ?? "");
							setExpectedStatus(String(test.expectedStatus ?? 200));
							setResponseAssertions((test.responseAssertions ?? []).join("\n"));
							setMaxResponseTime(String(test.maxResponseTimeMs ?? ""));
							setEditing(true);
						}}
						size="default"
						type="button"
						variant="outline"
					>
						<Glyph name={editing ? "check" : "file"} />
						{editing ? "Save plan" : "Edit plan"}
					</Button>
					{editing ? (
						<Button
							onClick={() => setEditing(false)}
							size="default"
							type="button"
							variant="ghost"
						>
							Cancel
						</Button>
					) : null}
					<Button
						onClick={onRun}
						size="default"
						type="button"
						variant="default"
					>
						<Glyph name="play" />
						Run case
					</Button>
				</div>
			</div>
			<div className="case-workspace">
				<aside className="case-sidebar ts-card">
					<Tabs
						onValueChange={(value) => {
							if (value === "overview" || value === "chat") {
								setLeftTab(value);
							}
						}}
						value={leftTab}
					>
						<TabsList variant="line">
							<TabsTrigger value={"overview"}>Overview</TabsTrigger>
							<TabsTrigger value={"chat"}>
								Chat <span className="new-dot" />
							</TabsTrigger>
						</TabsList>
					</Tabs>
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
								{editing ? (
									<div className="case-edit-form">
										<label className="form-field">
											<span>Description</span>
											<Textarea
												className="ts-textarea"
												onChange={(event) => setDescription(event.target.value)}
												value={description}
											/>
										</label>
										{test.type === "API" ? (
											<>
												<label className="form-field">
													<span>HTTP method</span>
													<Input
														className="ts-input"
														onChange={(event) =>
															setRequestMethod(event.target.value)
														}
														value={requestMethod}
													/>
												</label>
												<label className="form-field">
													<span>Max response time · optional ms</span>
													<Input
														className="ts-input"
														onChange={(event) =>
															setMaxResponseTime(event.target.value)
														}
														type="number"
														value={maxResponseTime}
													/>
												</label>
												<label className="form-field">
													<span>Request path</span>
													<Input
														className="ts-input"
														onChange={(event) =>
															setRequestPath(event.target.value)
														}
														placeholder="/api/health"
														value={requestPath}
													/>
												</label>
												<label className="form-field">
													<span>Expected status</span>
													<Input
														className="ts-input"
														onChange={(event) =>
															setExpectedStatus(event.target.value)
														}
														type="number"
														value={expectedStatus}
													/>
												</label>
												<label className="form-field">
													<span>Response assertions · one per line</span>
													<Textarea
														className="ts-textarea"
														onChange={(event) =>
															setResponseAssertions(event.target.value)
														}
														placeholder="contains:ok"
														value={responseAssertions}
													/>
												</label>
											</>
										) : null}
										<label className="form-field">
											<span>Steps · one per line</span>
											<Textarea
												className="ts-textarea"
												onChange={(event) => setSteps(event.target.value)}
												value={steps}
											/>
										</label>
									</div>
								) : (
									<>
										<p>{test.description}</p>
										<Button
											onClick={() => setEditing(true)}
											size="sm"
											type="button"
											variant="ghost"
										>
											Refine plan
										</Button>
									</>
								)}
							</div>
							<div className="case-section">
								<span className="case-section-label">Terminal output</span>
								<pre className="terminal-output">
									{run?.evidence.find((item) => item.testId === test.id)
										? `${run.evidence.find((item) => item.testId === test.id)?.statusCode} ${run.evidence.find((item) => item.testId === test.id)?.title ?? "Untitled response"}\n${run.evidence.find((item) => item.testId === test.id)?.responseTimeMs} ms · ${run.evidenceLevel}\n${run.evidence.find((item) => item.testId === test.id)?.textPreview ?? ""}`
										: `${test.steps.length} planned steps\nReady to run against ${project.url}`}
								</pre>
							</div>
						</div>
					) : (
						<div className="case-chat">
							<div className="chat-message agent">
								<span className="chat-avatar">✦</span>
								<p>
									The Ryu agent can refine this plan when its capability is
									granted.
								</p>
							</div>
							<div className="chat-suggestion">
								<span>Agent lane required</span>
								<Button disabled type="button">
									Suggest refinement
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
						<Tabs
							onValueChange={(value) => {
								if (value === "preview" || value === "code") {
									onNavigate({
										kind: "test",
										projectId: project.id,
										testId: test.id,
										panel: value,
									});
								}
							}}
							value={panel}
						>
							<TabsList variant="line">
								<TabsTrigger value={"preview"}>Preview</TabsTrigger>
								<TabsTrigger value={"code"}>Code</TabsTrigger>
							</TabsList>
						</Tabs>
						<div className="preview-toolbar-actions">
							<span className="save-state">
								<span />
								Plan only
							</span>
							<Button
								onClick={onRunProject}
								size="sm"
								type="button"
								variant="outline"
							>
								Run project
							</Button>
						</div>
					</div>
					{panel === "preview" ? (
						<PreviewFrame project={project} test={test} />
					) : (
						<CodeFrame test={test} />
					)}
				</section>
			</div>
		</div>
	);
}

function PreviewFrame({ project, test }: { project: Project; test: TestCase }) {
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
							? project.url + (test.requestPath ?? "")
							: project.url}
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
	const pythonSource = [
		`# Python equivalent for ${test.name}`,
		`def test_${test.id.replaceAll("-", "_")}():`,
		"    response = requests." +
			(test.requestMethod ?? "get").toLowerCase() +
			'("' +
			(test.requestPath ?? "target") +
			'")',
		`    assert response.status_code == ${test.expectedStatus ?? 200}`,
	].join("\n");
	const code = [
		test.source ??
			"// Generated source is not available until this case is saved.",
		pythonSource,
	].join("\n\n");
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
	onUpdateList,
	tests,
}: {
	lists: TestList[];
	onCreate(name: string): void;
	onRun(list: TestList): void;
	onUpdateList(listId: string, testIds: string[]): void;
	tests: TestCase[];
}) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [editingListId, setEditingListId] = useState<string | null>(null);
	const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
	const beginEdit = (list: TestList) => {
		setEditingListId(list.id);
		setSelectedTestIds(list.testIds ?? tests.map((test) => test.id));
	};
	return (
		<div className="page-stack">
			<ScreenHeader
				actions={
					<Button
						onClick={() => setOpen((value) => !value)}
						size="default"
						type="button"
						variant="default"
					>
						<Glyph name="plus" />
						New list
					</Button>
				}
				description="Group live verification cases together for repeatable local runs."
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
								disabled={name.trim().length === 0}
								onClick={() => {
									onCreate(name.trim());
									setName("");
									setOpen(false);
								}}
								size="default"
								type="button"
								variant="default"
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
					helper="Node-local collections"
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
								onClick={() => onRun(list)}
								size="sm"
								type="button"
								variant="outline"
							>
								Run now
							</Button>
							<Button
								onClick={() =>
									editingListId === list.id
										? (onUpdateList(list.id, selectedTestIds),
											setEditingListId(null))
										: beginEdit(list)
								}
								size="sm"
								type="button"
								variant="ghost"
							>
								{editingListId === list.id ? "Save cases" : "Edit cases"}
							</Button>
						</div>
						{editingListId === list.id ? (
							<div className="list-membership-editor">
								<strong>Test cases in this collection</strong>
								{tests.map((test) => (
									<label className="list-membership-option" key={test.id}>
										<Checkbox
											checked={selectedTestIds.includes(test.id)}
											onCheckedChange={(checked) =>
												setSelectedTestIds((current) =>
													checked
														? [...new Set([...current, test.id])]
														: current.filter((id) => id !== test.id)
												)
											}
										/>
										<span>{test.name}</span>
									</label>
								))}
							</div>
						) : null}
					</div>
				))}
			</Card>
		</div>
	);
}

export function MonitoringPage({
	lists,
	onCreateSchedule,
	onRunSchedule,
	onToggleSchedule,
	schedules,
}: {
	lists: TestList[];
	onCreateSchedule(input: {
		name: string;
		listId: string;
		frequency: string;
	}): void;
	onRunSchedule(schedule: Schedule): void;
	onToggleSchedule(schedule: Schedule, active: boolean): void;
	schedules: Schedule[];
}) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("Nightly regression");
	const [frequency, setFrequency] = useState("Every night");
	const defaultList = lists[0];
	return (
		<div className="page-stack">
			<ScreenHeader
				actions={
					<Button
						disabled={!defaultList}
						onClick={() => setOpen((current) => !current)}
						size="default"
						type="button"
						variant="default"
					>
						<Glyph name="plus" />
						New schedule
					</Button>
				}
				description="Define node-local recurring verification and keep its last result visible."
				eyebrow="Collections"
				title="Monitoring"
			/>
			{open && defaultList ? (
				<Card className="ts-card inline-create">
					<CardContent>
						<div>
							<div className="eyebrow">New schedule</div>
							<h2>Keep a suite on a cadence</h2>
							<p>
								{defaultList.name} will be used for this node-local schedule.
							</p>
						</div>
						<div className="inline-create-form">
							<Input
								aria-label="Schedule name"
								className="ts-input"
								onChange={(event) => setName(event.target.value)}
								value={name}
							/>
							<Input
								aria-label="Schedule frequency"
								className="ts-input"
								onChange={(event) => setFrequency(event.target.value)}
								value={frequency}
							/>
							<Button
								disabled={!(name.trim() && frequency.trim())}
								onClick={() => {
									onCreateSchedule({ frequency, listId: defaultList.id, name });
									setOpen(false);
								}}
								size="default"
								type="button"
								variant="default"
							>
								Create schedule
							</Button>
						</div>
					</CardContent>
				</Card>
			) : null}
			<div className="monitoring-banner">
				<div className="monitoring-art">
					<span />
					<span />
					<span />
					<span />
				</div>
				<div>
					<div className="eyebrow">Node-local cadence</div>
					<h2>Schedules stay close to the runner.</h2>
					<p>
						Ryu keeps the definition and last result in the sidecar. External CI
						and cloud grids are separate integrations, never implied by this
						local status.
					</p>
				</div>
				<div className="monitoring-banner-stat">
					<strong>
						{schedules.filter((schedule) => schedule.active).length}
					</strong>
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
								onClick={() => onToggleSchedule(schedule, !schedule.active)}
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
									<span>Boundary</span>
									<strong>Ryu node</strong>
								</div>
							</div>
							<div className="schedule-actions">
								<Button
									onClick={() => onRunSchedule(schedule)}
									size="sm"
									type="button"
									variant="outline"
								>
									Run now
								</Button>
								<span className="recording-note">Manual or local cadence</span>
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
		{
			id: "capabilities",
			label: "Capabilities",
			icon: "activity",
			detail: "Parity boundary",
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
										External API-key storage is outside Checks. Use Ryu grants
										or the provider-owned secret boundary.
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
										<strong>Ryu boundary</strong>
										<p>
											Checks never prints or persists a provider key. The live
											runner uses the target URL and the granted node
											capability.
										</p>
									</div>
								</div>
								<p className="settings-note">
									<Glyph name="key" />
									No third-party credential is required for the built-in
									live-http lane.
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
										GitHub merge gates remain an external CI integration.
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
										<h2>External integration</h2>
										<p>
											The local runner can produce a report for CI to consume,
											but this app does not authorize or store a GitHub account.
										</p>
									</div>
									<Button
										disabled
										size="default"
										type="button"
										variant="default"
									>
										Configure in CI
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
					{section === "capabilities" ? (
						<Card className="ts-card settings-card">
							<CardHeader className="ts-card-header">
								<div>
									<CardTitle>Checks capability matrix</CardTitle>
									<CardDescription>
										Every result is labeled by the capability that actually
										produced it.
									</CardDescription>
								</div>
								<StatusBadge status="passed" />
							</CardHeader>
							<CardContent>
								<div className="key-callout">
									<span className="key-callout-icon">
										<Glyph name="check" />
									</span>
									<div>
										<strong>Ryu-owned and live</strong>
										<p>
											Planning, context ingestion, feature exploration,
											live-http UI/API checks, API assertions, case/project
											runs, agent transcripts, retained evidence, healing,
											history, collections, schedules, CLI, CI exit codes, MCP,
											and analytics.
										</p>
									</div>
								</div>
								<div className="key-callout">
									<span className="key-callout-icon">
										<Glyph name="activity" />
									</span>
									<div>
										<strong>External capability required</strong>
										<p>
											Browser screenshots/video/DOM, visual and accessibility
											assertions, cross-browser and real-device matrices,
											OAuth/GitHub, provider-backed data, and hosted cloud
											orchestration appear only when a granted Ryu agent or
											external integration supplies them.
										</p>
									</div>
								</div>
							</CardContent>
						</Card>
					) : null}
				</div>
			</div>
		</div>
	);
}
