import type { RyuCatalogSnapshot } from "@ryu/app-host/app-bridge";
import {
	ModelAgentPicker,
	type RyuPickerSelection,
} from "@ryu/blocks/composer/runtime-picker";
import { Badge } from "@ryu/ui/components/badge.tsx";
import { Button } from "@ryu/ui/components/button.tsx";
import { Checkbox } from "@ryu/ui/components/checkbox.tsx";
import { Input } from "@ryu/ui/components/input.tsx";
import { Textarea } from "@ryu/ui/components/textarea.tsx";
import { type Dispatch, type SetStateAction, useState } from "react";
import { StatusBadge, TypeBadge } from "./components.tsx";
import { type ContextSource, PLANNING_CASES, typeClass } from "./data.ts";
import { Glyph, type IconName } from "./icons.tsx";
import type { Screen } from "./screen-model.ts";
import { ScreenHeader } from "./screens-dashboard.tsx";

export function CreateTestsPage({
	runtimeCatalog,
	onDiscoverModels,
	onGeneratePlan,
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
	onGeneratePlan(input: {
		name: string;
		url: string;
		brief: string;
		projectType: "UI" | "API" | "Mixed";
		runtimeSelection?: RyuPickerSelection;
	}): Promise<string[]>;
	step: number;
	onNavigate(screen: Screen): void;
	onCreate(draft: {
		name: string;
		type: "UI" | "API" | "Mixed";
		url: string;
		prd: string;
		testNames: string[];
		runtimeSelection?: RyuPickerSelection;
		contextSources?: ContextSource[];
	}): void;
}) {
	const [name, setName] = useState("Ryu Admin Console");
	const [type, setType] = useState<"UI" | "API" | "Mixed">("UI");
	const [url, setUrl] = useState("http://localhost:3000");
	const [prd, setPrd] = useState(
		"Users can sign in, search for an app, open its detail page, and recover from a failed checkout."
	);
	const [additionalContext, setAdditionalContext] = useState("");
	const [attachedSources, setAttachedSources] = useState<ContextSource[]>([]);
	const [selectedCases, setSelectedCases] = useState([true, true, true, false]);
	const [planningCases, setPlanningCases] = useState<string[]>([
		...PLANNING_CASES,
	]);
	const [runtimeSelection, setRuntimeSelection] = useState<
		RyuPickerSelection | undefined
	>();
	const [generating, setGenerating] = useState(false);
	const [generationNote, setGenerationNote] = useState<string | null>(null);
	const generatePlan = async () => {
		setGenerating(true);
		setGenerationNote(null);
		try {
			const generated = await onGeneratePlan({
				brief: [
					prd,
					additionalContext,
					...attachedSources.map(
						(source) => `${source.label}\n${source.value}`
					),
				]
					.filter(Boolean)
					.join("\n\n"),
				name,
				projectType: type,
				runtimeSelection,
				url,
			});
			if (generated.length === 0) {
				throw new Error("The model returned no cases.");
			}
			setPlanningCases(generated);
			setSelectedCases(generated.map(() => true));
			setGenerationNote(
				`Ryu AI generated ${generated.length} observable cases.`
			);
		} catch {
			const fallback = [
				"Target responds successfully",
				...PLANNING_CASES.filter((item) =>
					prd.toLowerCase().includes((item.split(" ")[0] ?? item).toLowerCase())
				),
			];
			const unique = [...new Set(fallback)].slice(0, 6);
			setPlanningCases(unique);
			setSelectedCases(unique.map(() => true));
			setGenerationNote(
				"AI generation was unavailable; a deterministic plan was prepared from the brief."
			);
		} finally {
			setGenerating(false);
		}
	};
	const steps = ["Configure", "Explore", "Plan", "Generate"];
	return (
		<div className="page-stack create-page">
			<ScreenHeader
				actions={
					<Button
						onClick={() => onNavigate({ kind: "home" })}
						size="default"
						type="button"
						variant="ghost"
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
							<label className="form-field">
								<span>Attach a text context file</span>
								<Input
									accept=".md,.txt,.json,.yaml,.yml,text/plain,application/json"
									className="ts-input"
									onChange={async (event) => {
										const file = event.target.files?.[0];
										if (!file) {
											return;
										}
										const value = await file.text();
										setAttachedSources((current) => [
											...current.filter((source) => source.label !== file.name),
											{
												kind: "file",
												label: file.name,
												value: value.slice(0, 100_000),
											},
										]);
									}}
									type="file"
								/>
								<small>
									{attachedSources.length} context file
									{attachedSources.length === 1 ? "" : "s"} attached
								</small>
							</label>
							<label className="form-field">
								<span>
									Additional context{" "}
									<em>Acceptance notes, OpenAPI paths, or reference URLs</em>
								</span>
								<Textarea
									className="ts-textarea"
									onChange={(event) => setAdditionalContext(event.target.value)}
									placeholder="Paste extra acceptance criteria or one reference URL per line."
									value={additionalContext}
								/>
							</label>
						</>
					) : null}
					{step === 1 ? <ExplorationStep url={url} /> : null}
					{step === 2 ? (
						<PlanStep
							cases={planningCases}
							generating={generating}
							generationNote={generationNote}
							onGenerate={generatePlan}
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
						disabled={step === 0}
						onClick={() => onNavigate({ kind: "create-tests", step: step - 1 })}
						size="default"
						type="button"
						variant="ghost"
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
								onClick={() =>
									onCreate({
										name,
										prd,
										runtimeSelection,
										contextSources: [
											...(additionalContext.trim()
												? [
														{
															kind: "notes",
															label: "Additional context",
															value: additionalContext.trim(),
														},
													]
												: []),
											...attachedSources,
										],
										testNames: planningCases.filter(
											(_, index) => selectedCases[index] === true
										),
										type,
										url,
									})
								}
								size="default"
								type="button"
								variant="default"
							>
								<Glyph name="test" />
								Create project
							</Button>
						) : (
							<Button
								onClick={() =>
									onNavigate({ kind: "create-tests", step: step + 1 })
								}
								size="default"
								type="button"
								variant="default"
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
					<h2>Explore immediately after saving</h2>
					<p>
						The project will use the node-local runner to map live feature
						signals before you refine the generated cases.
					</p>
				</div>
				<StatusBadge status="idle" />
			</div>
			<div className="exploration-progress">
				<div className="exploration-progress-head">
					<span>Queued live exploration</span>
					<strong>0%</strong>
				</div>
				<div className="coverage-bar">
					<span style={{ width: "0%" }} />
				</div>
				<small>{url} · The target is checked after the project is saved</small>
			</div>
			<div className="feature-map-list">
				<FeatureMapRow
					detail="Mapped by the node runner after save"
					done={false}
					icon="user"
					title="Authentication"
				/>
				<FeatureMapRow
					detail="Mapped by the node runner after save"
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
			<span className="recording-note">
				<Glyph name="activity" /> Runs after save
			</span>
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
	cases,
	generating,
	generationNote,
	onGenerate,
	selectedCases,
	setSelectedCases,
}: {
	cases: string[];
	generating: boolean;
	generationNote: string | null;
	onGenerate(): void;
	selectedCases: boolean[];
	setSelectedCases: Dispatch<SetStateAction<boolean[]>>;
}) {
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
			<div className="plan-actions">
				<Button
					disabled={generating}
					onClick={onGenerate}
					size="default"
					type="button"
					variant="outline"
				>
					<Glyph name="test" />
					{generating ? "Generating…" : "Generate with Ryu AI"}
				</Button>
				<span>
					{generationNote ??
						"AI planning is optional; the fallback remains local and deterministic."}
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
						<Checkbox
							aria-label={`Keep ${testName}`}
							checked={selectedCases[index]}
							onCheckedChange={() =>
								setSelectedCases((current) =>
									current.map((value, itemIndex) =>
										itemIndex === index ? !value : value
									)
								)
							}
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
			? "Saved as an optional Ryu agent selection"
			: `Saved for the selected model lane (${runtimeCatalog?.providers.find((provider) => provider.id === runtimeSelection.providerId)?.label ?? runtimeSelection.providerId})`
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
						{name} will be created on this node with an editable plan. Explore
						the target, run live checks, and keep the resulting evidence bundle.
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
				<Badge variant="outline">Ready</Badge>
			</div>
			<div className="generate-checklist">
				<div>
					<Glyph name="activity" />
					<span>Plan can be refined locally</span>
				</div>
				<div>
					<Glyph name="check" />
					<span>Live HTTP evidence is retained per run</span>
				</div>
				<div>
					<Glyph name="clock" />
					<span>Node-local schedules can be added later</span>
				</div>
			</div>
		</div>
	);
}
