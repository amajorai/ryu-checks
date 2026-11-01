import { useLiteralMessages } from "@ryu/i18n/react";
import { Button } from "@ryu/ui/components/button.tsx";
import { Input } from "@ryu/ui/components/input.tsx";
import { Tabs, TabsList, TabsTrigger } from "@ryu/ui/components/tabs.tsx";
import { Textarea } from "@ryu/ui/components/textarea.tsx";
import { useState } from "react";
import { StatusBadge } from "./components.tsx";
import type { Project, TestCase, TestRun } from "./data.ts";
import { Glyph } from "./icons.tsx";
import type { Screen } from "./screen-model.ts";
import { LogoMark } from "./screens-dashboard.tsx";

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
	const tl = useLiteralMessages();
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
						{tl("Updated {updated} · {length} steps · {priority} priority", {
							updated: test.updated,
							length: String(test.steps.length),
							priority: test.priority,
						})}
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
