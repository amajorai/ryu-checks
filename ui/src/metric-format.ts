// Coverage percentages and response times in the viewer's number format:
// "42%" / "42 %" / "٪٤٢" and "120ms" / "120 мс", instead of hand-built
// `{coverage}%` and `{ms} ms` text that stays English in every locale.

import { activeLocale } from "@ryu/i18n/core";
import { formatDurationUnit } from "@ryu/i18n/format-intl";
import { formatPercent } from "@ryu/i18n/format-percent";

/** A 0-100 coverage score as a whole-number percentage. */
export function coverageText(
	coverage: number | null | undefined,
	locale: string = activeLocale()
): string {
	return formatPercent((coverage ?? 0) / 100, 0, locale);
}

/** A response time in whole milliseconds. */
export function responseTimeText(
	milliseconds: number | null | undefined,
	locale: string = activeLocale()
): string {
	return formatDurationUnit(
		Math.max(0, Math.round(milliseconds ?? 0)),
		"millisecond",
		0,
		locale
	);
}
