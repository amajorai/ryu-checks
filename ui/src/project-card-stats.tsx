import { activeLocale, numberFormatter } from "@ryu/i18n/core";
import { useOptionalI18n, useRichLiteralMessages } from "@ryu/i18n/react";
import type { ReactNode } from "react";

const bold = { b: (chunks: ReactNode) => <strong>{chunks}</strong> };

/** A 0-100 coverage figure as "91%", "87,5 %" or "٩١٪" in the shown locale. */
export function formatCoverage(
	percent: number,
	locale: string = activeLocale()
): string {
	return numberFormatter(locale, {
		maximumFractionDigits: 1,
		style: "percent",
	}).format(percent / 100);
}

/**
 * A project card's counters. Each one is a whole message with the number
 * inside it, so a language can inflect the noun for the count ("1 тест",
 * "3 теста", "5 тестов") and place it where its grammar wants.
 */
export function ProjectCardStats({
	coverage,
	passed,
	tests,
}: {
	coverage: number;
	passed: number;
	tests: number;
}) {
	const tlRich = useRichLiteralMessages();
	const locale = useOptionalI18n()?.formatLocale ?? activeLocale();
	return (
		<div className="project-card-stats">
			<span>
				{tlRich(
					"{count, plural, one {<b>#</b> test} other {<b>#</b> tests}}",
					{ count: tests },
					bold
				)}
			</span>
			<span>
				{tlRich(
					"{count, plural, one {<b>#</b> passed} other {<b>#</b> passed}}",
					{ count: passed },
					bold
				)}
			</span>
			<span>
				{tlRich(
					"<b>{coverage}</b> coverage",
					{ coverage: formatCoverage(coverage, locale) },
					bold
				)}
			</span>
		</div>
	);
}
