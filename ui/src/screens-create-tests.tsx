import type { RyuCatalogSnapshot } from "@ryu/app-host/app-bridge";
import {
	ModelAgentPicker,
	type RyuPickerSelection,
} from "@ryu/blocks/composer/runtime-picker";
import { Badge } from "@ryu/ui/components/badge.tsx";
import { Button } from "@ryu/ui/components/button.tsx";
import { Input } from "@ryu/ui/components/input.tsx";
import { Textarea } from "@ryu/ui/components/textarea.tsx";
import { type Dispatch, type SetStateAction, useState } from "react";
import { StatusBadge, TypeBadge } from "./components.tsx";
import { type Project, typeClass } from "./data.ts";
import { Glyph, type IconName } from "./icons.tsx";
import type { Screen } from "./screen-model.ts";
import { ScreenHeader } from "./screens-dashboard.tsx";

export function CreateTestsPage({
	runtimeCatalog,
	onDiscoverModels,
	step,
	onNavigate,
	onCreate,
	onNotify,
}: {
	runtimeCatalog: RyuCatalogSnapshot | null;
	onDiscoverModels(providerId: string): Promise<{
		models: { id: string; name?: string }[];
		providerId: string;
		source: string;
	}>;
	step: number;
	onNavigate(screen: Screen): void;
	onCreate(draft: {
		name: string;
		type: "UI" | "API" | "Mixed";
		url: string;
		prd: string;
		runtimeSelection?: RyuPickerSelection;
	}): void;
	onNotify(message: string): void;
}) {
	const [name, setName] = useState("Ryu Admin Console");
	const [type, setType] = useState<"UI" | "API" | "Mixed">("UI");
	const [url, setUrl] = useState("http://localhost:3000");
	const [prd, setPrd] = useState(
		"Users can sign in, search for an app, open its detail page, and recover from a failed checkout."
	);
	const [selectedCases, setSelectedCases] = useState([true, true, true, false]);
	const [runtimeSelection, setRuntimeSelection] = useState<
		RyuPickerSelection | undefined
	>();
	const steps = ["Configure", "Explore", "Plan", "Generate"];
	return (
		<div className="page-stack create-page">
			<ScreenHeader
				actions={
					<Button
						className="ts-btn ts-btn-ghost"
						onClick={() => onNavigate({ kind: "home" })}
						type="button"
					>
						Save & exit
					</Button>
				}
				description="Start with the product intent. Ryu turns it into an observable verification loop."
				eyebrow="Testing / New project"
				title="Create Tests"
			/>
			<div className="wizard-shell">
				<div className="wizard-stepper">
					{steps.map((label, index) => (
						<div
							className={[
								"wizard-step",
								index === step && "is-current",
								index < step && "is-done",
							]
								.filter(Boolean)
								.join(" ")}
							key={label}
						>
							<span>{index < step ? "✓" : index + 1}</span>
							<strong>{label}</strong>
							{index < steps.length - 1 ? <i /> : null}
						</div>
					))}
				</div>
				<div className="wizard-content">
					{step === 0 ? (
						<>
							<div className="wizard-intro">
								<span className="wizard-icon">
									<Glyph name="test" />
								</span>
								<div>
									<h2>Tell us what you are building</h2>
									<p>
										A URL is enough to begin. A short product description helps
										the feature map reflect what should be true, not just what
										happens to work today.
									</p>
								</div>
							</div>
							<div className="form-grid">
								<label className="form-field">
									<span>Project name</span>
									<Input
										className="ts-input"
										onChange={(event) => setName(event.target.value)}
										value={name}
									/>
								</label>
								<label className="form-field">
									<span>Target URL</span>
									<Input
										className="ts-input"
										onChange={(event) => setUrl(event.target.value)}
										value={url}
									/>
								</label>
							</div>
							<div className="form-field">
								<span>Test surface</span>
								<div className="type-options">
									{(["UI", "API", "Mixed"] as const).map((option) => (
										<Button
											aria-pressed={type === option}
											className={[
												"type-option",
												type === option && "is-selected",
											]
												.filter(Boolean)
												.join(" ")}
											key={option}
											onClick={() => setType(option)}
											type="button"
										>
											<span className={`type-option-icon${typeClass(option)}`}>
												<Glyph
													name={
														option === "API"
															? "api"
															: option === "Mixed"
																? "git-branch"
																: "test"
													}
												/>
											</span>
											<strong>
												{option === "UI"
													? "Web / UI"
													: option === "API"
														? "Backend / API"
														: "Mixed"}
											</strong>
											<small>
												{option === "UI"
													? "User journeys, forms, visual states"
													: option === "API"
														? "Contracts, auth, data workflows"
														: "One plan across every surface"}
											</small>
										</Button>
									))}
								</div>
							</div>
							<div className="runtime-picker-card">
								<div>
									<span className="eyebrow">Ryu runtime</span>
									<strong>Choose the execution lane</strong>
									<p>
										Use the same model, agent, and provider catalog as every Ryu
										app.
									</p>
								</div>
								<ModelAgentPicker
									catalog={runtimeCatalog}
									onDiscoverModels={onDiscoverModels}
									onSelectionChange={setRuntimeSelection}
									value={runtimeSelection}
								/>
							</div>
							<label className="form-field">
								<span>
									Product description or PRD <em>Strongly recommended</em>
								</span>
								<Textarea
									className="ts-textarea"
									onChange={(event) => setPrd(event.target.value)}
									value={prd}
								/>
							</label>
						</>
					) : null}
					{step === 1 ? (
						<ExplorationStep onNotify={onNotify} url={url} />
					) : null}
					{step === 2 ? (
						<PlanStep
							selectedCases={selectedCases}
							setSelectedCases={setSelectedCases}
						/>
					) : null}
					{step === 3 ? (
						<GenerateStep
							name={name}
							runtimeCatalog={runtimeCatalog}
							runtimeSelection={runtimeSelection}
							type={type}
							url={url}
						/>
					) : null}
				</div>
				<div className="wizard-footer">
					<Button
						className="ts-btn ts-btn-ghost"
						disabled={step === 0}
						onClick={() => onNavigate({ kind: "create-tests", step: step - 1 })}
						type="button"
					>
						<Glyph name="arrow-left" />
						Back
					</Button>
					<div className="wizard-footer-right">
						<span>
							{step === 3
								? "Ready to add a local project"
								: "You can edit the plan later"}
						</span>
						{step === 3 ? (
							<Button
								className="ts-btn ts-btn-primary"
								onClick={() =>
									onCreate({
										name,
										prd,
										runtimeSelection,
										type,
										url,
									})
								}
								type="button"
							>
								<Glyph name="test" />
								Create project
							</Button>
						) : (
							<Button
								className="ts-btn ts-btn-primary"
								onClick={() =>
									onNavigate({ kind: "create-tests", step: step + 1 })
								}
								type="button"
							>
								Continue <Glyph name="arrow-right" />
							</Button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

function ExplorationStep({
	url,
	onNotify,
}: {
	url: string;
	onNotify(message: string): void;
}) {
	const [started, setStarted] = useState(false);
	return (
		<div className="wizard-middle">
			<div className="step-callout">
				<span className="step-callout-icon">
					<Glyph name="activity" />
				</span>
				<div>
					<div className="eyebrow">Feature exploration</div>
					<h2>See what the app actually does</h2>
					<p>
						Ryu walks the target URL and maps the flows that will ground the
						plan. This local preview uses product intent as its starting point.
					</p>
				</div>
				<StatusBadge status={started ? "running" : "idle"} />
			</div>
			<div className="exploration-progress">
				<div className="exploration-progress-head">
					<span>{started ? "Exploring target" : "Ready to explore"}</span>
					<strong>{started ? "67%" : "0%"}</strong>
				</div>
				<div className="coverage-bar">
					<span style={{ width: started ? "67%" : "4%" }} />
				</div>
				<small>
					{url} ·{" "}
					{started
						? "3 of 5 feature areas mapped"
						: "No network request is made by this companion preview"}
				</small>
			</div>
			<div className="feature-map-list">
				<FeatureMapRow
					detail="Sign in, sign up, recovery"
					done={started}
					icon="user"
					title="Authentication"
				/>
				<FeatureMapRow
					detail="Search, filter, open detail"
					done={started}
					icon="search"
					title="Marketplace search"
				/>
				<FeatureMapRow
					detail="Add, configure, recover"
					done={false}
					icon="package"
					title="Checkout"
				/>
				<FeatureMapRow
					detail="Permissions and preferences"
					done={false}
					icon="settings"
					title="Workspace settings"
				/>
			</div>
			<Button
				className="ts-btn ts-btn-secondary"
				onClick={() => {
					setStarted(true);
					onNotify("Feature exploration started");
				}}
				type="button"
			>
				<Glyph name="play" />
				{started ? "Exploration running" : "Start local exploration"}
			</Button>
		</div>
	);
}

function FeatureMapRow({
	icon,
	title,
	detail,
	done,
}: {
	icon: IconName;
	title: string;
	detail: string;
	done: boolean;
}) {
	return (
		<div className="feature-map-row">
			<span
				className={["feature-map-icon", done && "done"]
					.filter(Boolean)
					.join(" ")}
			>
				<Glyph name={done ? "check" : icon} />
			</span>
			<div>
				<strong>{title}</strong>
				<small>{detail}</small>
			</div>
			<span
				className={["feature-map-status", done && "done"]
					.filter(Boolean)
					.join(" ")}
			>
				{done ? "Mapped" : "Queued"}
			</span>
		</div>
	);
}

function PlanStep({
	selectedCases,
	setSelectedCases,
}: {
	selectedCases: boolean[];
	setSelectedCases: Dispatch<SetStateAction<boolean[]>>;
}) {
	const cases = [
		"Returning user signs in and reaches the dashboard",
		"New user signs up and reaches the dashboard",
		"Search returns an app detail page",
		"Checkout recovers from a billing error",
	];
	return (
		<div className="wizard-middle">
			<div className="step-callout">
				<span className="step-callout-icon">
					<Glyph name="package" />
				</span>
				<div>
					<div className="eyebrow">Plan and review</div>
					<h2>Choose the flows worth keeping</h2>
					<p>
						The plan is a living contract. Start with the important paths, then
						refine individual tests in their detail view.
					</p>
				</div>
				<span className="selection-count">
					{selectedCases.filter(Boolean).length} selected
				</span>
			</div>
			<div className="plan-table">
				<div className="plan-table-head">
					<span>Keep</span>
					<span>Priority</span>
					<span>Test case</span>
					<span>Type</span>
				</div>
				{cases.map((testName, index) => (
					<div
						className={["plan-row", selectedCases[index] && "is-selected"]
							.filter(Boolean)
							.join(" ")}
						key={testName}
					>
						<Input
							aria-label={`Keep ${testName}`}
							checked={selectedCases[index]}
							onChange={() =>
								setSelectedCases((current) =>
									current.map((value, itemIndex) =>
										itemIndex === index ? !value : value
									)
								)
							}
							type="checkbox"
						/>
						<span className={`priority-pill${index === 3 ? "medium" : "high"}`}>
							{index === 3 ? "Medium" : "High"}
						</span>
						<span className="plan-case-name">{testName}</span>
						<TypeBadge type="UI" />
					</div>
				))}
			</div>
		</div>
	);
}

function GenerateStep({
	name,
	runtimeCatalog,
	runtimeSelection,
	type,
	url,
}: {
	name: string;
	runtimeCatalog: RyuCatalogSnapshot | null;
	runtimeSelection?: RyuPickerSelection;
	type: Project["type"];
	url: string;
}) {
	const runtimeLabel = runtimeSelection
		? runtimeSelection.kind === "agent"
			? (runtimeCatalog?.agents.find(
					(agent) => agent.id === runtimeSelection.agentId
				)?.name ?? runtimeSelection.agentId)
			: runtimeSelection.modelId
		: "Ryu host default";
	const runtimeDetail = runtimeSelection
		? runtimeSelection.kind === "agent"
			? "Core-mediated agent execution"
			: (runtimeCatalog?.providers.find(
					(provider) => provider.id === runtimeSelection.providerId
				)?.label ?? runtimeSelection.providerId)
		: runtimeCatalog
			? "Choose from the shared provider catalog"
			: "Open inside Ryu to connect";
	return (
		<div className="wizard-middle">
			<div className="generate-hero">
				<span className="generate-spark">
					<Glyph name="test" />
				</span>
				<div>
					<div className="eyebrow">Generation ready</div>
					<h2>Make the plan executable</h2>
					<p>
						{name} will be created as a local Ryu project. Its UI, API, and MCP
						run seams stay inside the app boundary.
					</p>
				</div>
				<StatusBadge status="passed" />
			</div>
			<div className="generation-grid">
				<div className="generation-card">
					<span className="generation-number">24</span>
					<strong>Planned tests</strong>
					<small>Across {type === "Mixed" ? "UI + API" : type} flows</small>
				</div>
				<div className="generation-card">
					<span className="generation-number">4</span>
					<strong>Feature areas</strong>
					<small>Mapped from product intent</small>
				</div>
				<div className="generation-card">
					<span className="generation-number">1</span>
					<strong>Target</strong>
					<small>{url}</small>
				</div>
			</div>
			<div className="runtime-selection-summary">
				<div>
					<span className="eyebrow">Execution lane</span>
					<strong>{runtimeLabel}</strong>
					<small>{runtimeDetail}</small>
				</div>
				<Badge variant="outline">Ryu bridge</Badge>
			</div>
			<div className="generate-checklist">
				<div>
					<Glyph name="check" />
					<span>Plan reviewed and ready to refine</span>
				</div>
				<div>
					<Glyph name="check" />
					<span>Run evidence stays attached to each case</span>
				</div>
				<div>
					<Glyph name="check" />
					<span>Monitoring can be added from Test Lists</span>
				</div>
			</div>
		</div>
	);
}
