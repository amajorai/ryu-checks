import { useLiteralMessages } from "@ryu/i18n/react";
import { Button } from "@ryu/ui/components/button.tsx";
import { Checkbox } from "@ryu/ui/components/checkbox.tsx";
import type { Dispatch, SetStateAction } from "react";
import { TypeBadge } from "./components.tsx";
import { Glyph } from "./icons.tsx";

export function PlanStep({
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
	const tl = useLiteralMessages();
	return (
		<div className="wizard-middle">
			<div className="step-callout">
				<span className="step-callout-icon">
					<Glyph name="package" />
				</span>
				<div>
					<h2>Choose the flows worth keeping</h2>
					<p>
						The plan is a living contract. Start with the important paths, then
						refine individual tests in their detail view.
					</p>
				</div>
				<span className="selection-count">
					{tl("{length} selected", {
						length: String(selectedCases.filter(Boolean).length),
					})}
				</span>
			</div>
			<div>
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
							aria-label={tl("Keep {testName}", { testName })}
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
