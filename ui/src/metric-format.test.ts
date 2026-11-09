import { describe, expect, it } from "bun:test";
import { coverageText, responseTimeText } from "./metric-format.ts";

const NO_BREAK_SPACE = String.fromCodePoint(0xa0);

describe("checks metric formatting", () => {
	it("keeps the English forms", () => {
		expect(coverageText(42, "en")).toBe("42%");
		expect(coverageText(null, "en")).toBe("0%");
		expect(responseTimeText(120, "en")).toBe("120ms");
		expect(responseTimeText(undefined, "en")).toBe("0ms");
	});

	it("uses the locale's percent sign, digits and unit", () => {
		expect(coverageText(42, "de")).toBe(`42${NO_BREAK_SPACE}%`);
		expect(coverageText(42, "ar")).toBe(
			new Intl.NumberFormat("ar", { style: "percent" }).format(0.42)
		);
		expect(responseTimeText(120, "ru")).toContain("мс");
		expect(responseTimeText(120, "ru")).toBe(
			new Intl.NumberFormat("ru", {
				style: "unit",
				unit: "millisecond",
				unitDisplay: "short",
			}).format(120)
		);
	});
});
