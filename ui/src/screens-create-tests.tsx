import type { RyuCatalogSnapshot } from "@ryu/app-host/app-bridge";
import {
	ModelAgentPicker,
	type RyuPickerSelection,
} from "@ryu/blocks/composer/runtime-picker";
import { useLiteralMessages } from "@ryu/i18n/react";
import { Button } from "@ryu/ui/components/button.tsx";
import { Input } from "@ryu/ui/components/input.tsx";
import { Textarea } from "@ryu/ui/components/textarea.tsx";
import { useState } from "react";
import { type ContextSource, PLANNING_CASES, typeClass } from "./data.ts";
import { Glyph } from "./icons.tsx";
import type { Screen } from "./screen-model.ts";
import { ExplorationStep } from "./screens-create-tests-exploration-step.tsx";
import { GenerateStep } from "./screens-create-tests-generate-step.tsx";
import { PlanStep } from "./screens-create-tests-plan-step.tsx";
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
	const tl = useLiteralMessages();
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
		<div className="page-stack">
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
							<div className="wizard-heading">
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
										onChange={(event) => setName(event.target.value)}
										value={name}
									/>
								</label>
								<label className="form-field">
									<span>Target URL</span>
									<Input
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
											className="w-full justify-start text-left"
											key={option}
											onClick={() => setType(option)}
											size="lg"
											type="button"
											variant={type === option ? "secondary" : "outline"}
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
									onChange={(event) => setPrd(event.target.value)}
									rows={5}
									value={prd}
								/>
							</label>
							<label className="form-field">
								<span>Attach a text context file</span>
								<Input
									accept=".md,.txt,.json,.yaml,.yml,text/plain,application/json"
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
									{tl(
										"{count, plural, one {{length} context file attached} other {{length} context files attached}}",
										{
											count: attachedSources.length,
											length: String(attachedSources.length),
										}
									)}
								</small>
							</label>
							<label className="form-field">
								<span>
									Additional context{" "}
									<em>Acceptance notes, OpenAPI paths, or reference URLs</em>
								</span>
								<Textarea
									onChange={(event) => setAdditionalContext(event.target.value)}
									placeholder="Paste extra acceptance criteria or one reference URL per line."
									rows={4}
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
