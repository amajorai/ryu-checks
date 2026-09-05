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
import { PLANNING_CASES, selectedPlanningCases, typeClass } from "./data.ts";
import { Glyph, type IconName } from "./icons.tsx";
import type { Screen } from "./screen-model.ts";
import { ScreenHeader } from "./screens-dashboard.tsx";

export function CreateTestsPage({
	runtimeCatalog,
	onDiscoverModels,
	step,
	onNavigate,
	onCreate,
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
		testNames: string[];
		runtimeSelection?: RyuPickerSelection;
	}): void;
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
					{step === 1 ? <ExplorationStep url={url} /> : null}
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
							selectedCount={selectedCases.filter(Boolean).length}
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
										testNames: selectedPlanningCases(selectedCases),
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

function ExplorationStep({ url }: { url: string }) {
	return (
		<div className="wizard-middle">
			<div className="step-callout">
				<span className="step-callout-icon">
					<Glyph name="activity" />
				</span>
				<div>
					<div className="eyebrow">Feature exploration</div>
					<h2>Site exploration is not connected</h2>
					<p>
						The target URL is kept as planning context. This build does not make
						a network request or drive a browser session.
					</p>
				</div>
				<StatusBadge status="idle" />
			</div>
			<div className="exploration-progress">
				<div className="exploration-progress-head">
					<span>Planning only</span>
					<strong>0%</strong>
				</div>
				<div className="coverage-bar">
					<span style={{ width: "0%" }} />
				</div>
				<small>
					{url} · No network request is made by this companion preview
				</small>
			</div>
			<div className="feature-map-list">
				<FeatureMapRow
					detail="Will be mapped by a connected runner"
					done={false}
					icon="user"
					title="Authentication"
				/>
				<FeatureMapRow
					detail="Will be mapped by a connected runner"
					done={false}
					icon="search"
					title="Marketplace search"
				/>
				<FeatureMapRow
					detail="Not explored"
					done={false}
					icon="package"
					title="Checkout"
				/>
				<FeatureMapRow
					detail="Not explored"
					done={false}
					icon="settings"
					title="Workspace settings"
				/>
			</div>
			<Button className="ts-btn ts-btn-secondary" disabled type="button">
				Exploration unavailable
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
	const cases = PLANNING_CASES;
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
	selectedCount,
	url,
}: {
	name: string;
	runtimeCatalog: RyuCatalogSnapshot | null;
	runtimeSelection?: RyuPickerSelection;
	selectedCount: number;
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
			? "Saved as a future runner selection"
			: `Saved for a future runner (${runtimeCatalog?.providers.find((provider) => provider.id === runtimeSelection.providerId)?.label ?? runtimeSelection.providerId})`
		: runtimeCatalog
			? "No runner connected"
			: "Open inside Ryu to browse the catalog";
	return (
		<div className="wizard-middle">
			<div className="generate-hero">
				<span className="generate-spark">
					<Glyph name="test" />
				</span>
				<div>
					<div className="eyebrow">Plan ready</div>
					<h2>Save an unexecuted test plan</h2>
					<p>
						{name} will be created as a local planning record. A connected
						runner must be added before it can explore, execute, or report
						evidence.
					</p>
				</div>
				<StatusBadge status="idle" />
			</div>
			<div className="generation-grid">
				<div className="generation-card">
					<span className="generation-number">{selectedCount}</span>
					<strong>Planning cases</strong>
					<small>Selected for this local plan</small>
				</div>
				<div className="generation-card">
					<span className="generation-number">0</span>
					<strong>Feature areas</strong>
					<small>Exploration has not run</small>
				</div>
				<div className="generation-card">
					<span className="generation-number">1</span>
					<strong>Target</strong>
					<small>{url}</small>
				</div>
			</div>
			<div className="runtime-selection-summary">
				<div>
					<span className="eyebrow">Future execution lane</span>
					<strong>{runtimeLabel}</strong>
					<small>{runtimeDetail}</small>
				</div>
				<Badge variant="outline">Not connected</Badge>
			</div>
			<div className="generate-checklist">
				<div>
					<Glyph name="activity" />
					<span>Plan can be refined locally</span>
				</div>
				<div>
					<Glyph name="activity" />
					<span>Run evidence is unavailable</span>
				</div>
				<div>
					<Glyph name="activity" />
					<span>Monitoring is unavailable</span>
				</div>
			</div>
		</div>
	);
}
