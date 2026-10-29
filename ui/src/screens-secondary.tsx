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
import { Checkbox } from "@ryu/ui/components/checkbox.tsx";
import { Input } from "@ryu/ui/components/input.tsx";
import { Switch } from "@ryu/ui/components/switch.tsx";
import { Tabs, TabsList, TabsTrigger } from "@ryu/ui/components/tabs.tsx";
import { Textarea } from "@ryu/ui/components/textarea.tsx";
import { useState } from "react";
import type { Project, Schedule, TestCase, TestList, TestRun } from "./data.ts";

export { runtimeSelectionLabel } from "./runtime-selection.ts";

import { ChecksCard, StatusBadge } from "./components.tsx";
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
		try {
			await onUpdateTest(test.id, {
				description,
				expectedStatus: Number(expectedStatus) || 200,
				requestMethod,
				requestPath,
				responseAssertions: responseAssertions.split("\n"),
				maxResponseTimeMs: Number(maxResponseTime) || undefined,
				steps: steps.split("\n"),
			});
		} catch {
			// The App owns the error notice. Retain the editor draft for an explicit retry.
			return;
		}
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
				<aside className="case-sidebar">
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
												onChange={(event) => setDescription(event.target.value)}
												rows={3}
												value={description}
											/>
										</label>
										{test.type === "API" ? (
											<>
												<label className="form-field">
													<span>HTTP method</span>
													<Input
														onChange={(event) =>
															setRequestMethod(event.target.value)
														}
														value={requestMethod}
													/>
												</label>
												<label className="form-field">
													<span>Max response time · optional ms</span>
													<Input
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
														onChange={(event) =>
															setResponseAssertions(event.target.value)
														}
														placeholder="contains:ok"
														rows={3}
														value={responseAssertions}
													/>
												</label>
											</>
										) : null}
										<label className="form-field">
											<span>Steps · one per line</span>
											<Textarea
												onChange={(event) => setSteps(event.target.value)}
												rows={4}
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
							<div className="chat-message">
								<span className="chat-avatar">✦</span>
								<p>
									Agent-assisted refinement isn't available here yet. Use Edit
									plan to update this case.
								</p>
							</div>
						</div>
					)}
				</aside>
				<section className="case-preview">
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
			? "preview-result passed"
			: test.status === "attention"
				? "preview-result attention"
				: "preview-result";
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
						<div className={resultClass}>
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
				title="Test Lists"
			/>
			{open ? (
				<ChecksCard className="inline-create">
					<CardContent>
						<div className="inline-create-content">
							<div>
								<h2>Give this collection a job</h2>
								<p>
									Use a name your team will recognize in a release note or
									schedule.
								</p>
							</div>
							<div className="inline-create-form">
								<Input
									aria-label="Test list name"
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
						</div>
					</CardContent>
				</ChecksCard>
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
			<Card>
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
				title="Monitoring"
			/>
			{open && defaultList ? (
				<ChecksCard className="inline-create">
					<CardContent>
						<div className="inline-create-content">
							<div>
								<h2>Keep a suite on a cadence</h2>
								<p>
									{defaultList.name} will be used for this node-local schedule.
								</p>
							</div>
							<div className="inline-create-form">
								<Input
									aria-label="Schedule name"
									onChange={(event) => setName(event.target.value)}
									value={name}
								/>
								<Input
									aria-label="Schedule frequency"
									onChange={(event) => setFrequency(event.target.value)}
									value={frequency}
								/>
								<Button
									disabled={!(name.trim() && frequency.trim())}
									onClick={() => {
										onCreateSchedule({
											frequency,
											listId: defaultList.id,
											name,
										});
										setOpen(false);
									}}
									size="default"
									type="button"
									variant="default"
								>
									Create schedule
								</Button>
							</div>
						</div>
					</CardContent>
				</ChecksCard>
			) : null}
			<div className="monitoring-banner">
				<div className="monitoring-art">
					<span />
					<span />
					<span />
					<span />
				</div>
				<div>
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
					<Card key={schedule.id}>
						<CardHeader>
							<div className="schedule-name">
								<span
									className={`schedule-icon ${schedule.active ? "active" : ""}`}
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
							<CardAction>
								<Switch
									aria-label={`Activate ${schedule.name}`}
									checked={schedule.active}
									onCheckedChange={(checked) =>
										onToggleSchedule(schedule, checked)
									}
								/>
							</CardAction>
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
		<div className="page-stack">
			<ScreenHeader
				description="Ryu keeps configuration close to the node that owns the work."
				title="Workspace settings"
			/>
			<div className="settings-layout">
				<div className="settings-nav">
					<RyuAppList aria-label="Settings sections">
						{sections.map((item) => (
							<RyuAppListItem
								accessories={<Glyph name="arrow-right" />}
								icon={<Glyph name={item.icon} />}
								key={item.id}
								onClick={() =>
									onNavigate({ kind: "settings", section: item.id })
								}
								selected={section === item.id}
								subtitle={item.detail}
								title={item.label}
							/>
						))}
					</RyuAppList>
				</div>
				<div className="settings-content">
					{section === "api-keys" ? (
						<Card>
							<CardHeader>
								<div>
									<CardTitle>API Keys</CardTitle>
									<CardDescription>
										External API-key storage is outside Checks. Use Ryu grants
										or the provider-owned secret boundary.
									</CardDescription>
								</div>
								<CardAction>
									<StatusBadge status="idle" />
								</CardAction>
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
						<Card>
							<CardHeader>
								<div>
									<CardTitle>GitHub App</CardTitle>
									<CardDescription>
										GitHub merge gates remain an external CI integration.
									</CardDescription>
								</div>
								<CardAction>
									<StatusBadge status="idle" />
								</CardAction>
							</CardHeader>
							<CardContent>
								<div className="github-connect">
									<span className="github-mark">
										<Glyph name="github" />
									</span>
									<div>
										<h2>External integration</h2>
										<p>
											GitHub authorization and workflow editing stay outside
											Checks. The CI guide covers the supported node-local CLI
											and authenticated Checks-tool paths.
										</p>
									</div>
									<Button
										disabled={!window.ryu?.ui?.openExternal}
										onClick={() =>
											void window.ryu?.ui?.openExternal?.({
												href: "https://docs.ryuhq.com/docs/apps/checks#cli-ci-and-mcp",
											})
										}
										size="default"
										type="button"
										variant="default"
									>
										View CI setup
									</Button>
								</div>
								<div className="settings-note">
									<Glyph name="git-branch" />
									<span>
										Use your CI provider to run the documented command or tool
										and choose its reporting and merge rules.
									</span>
								</div>
							</CardContent>
						</Card>
					) : null}
					{section === "capabilities" ? (
						<Card>
							<CardHeader>
								<div>
									<CardTitle>Checks capability matrix</CardTitle>
									<CardDescription>
										Every result is labeled by the capability that actually
										produced it.
									</CardDescription>
								</div>
								<CardAction>
									<StatusBadge status="passed" />
								</CardAction>
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
											Browser video, visual and accessibility assertions,
											cross-browser and real-device matrices, OAuth/GitHub,
											provider-backed data, and hosted cloud orchestration
											appear only when a granted Ryu agent or external
											integration supplies them.
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
