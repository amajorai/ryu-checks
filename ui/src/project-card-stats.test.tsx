import { afterEach, describe, expect, test } from "bun:test";
import { registerLiteralCatalogLoader } from "@ryu/i18n/core";
import { I18nProvider } from "@ryu/i18n/react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectCardStats } from "./project-card-stats.tsx";

const TESTS = "{count, plural, one {<b>#</b> test} other {<b>#</b> tests}}";

function render(locale: string, tests: number): string {
	return renderToStaticMarkup(
		<I18nProvider
			autoLocalizeDom={false}
			initialLocale={locale}
			initialPackId={null}
		>
			<ProjectCardStats coverage={87.5} passed={tests} tests={tests} />
		</I18nProvider>
	);
}

afterEach(() => registerLiteralCatalogLoader(null));

describe("ProjectCardStats", () => {
	test("reads naturally in English", () => {
		const html = render("en", 1);
		expect(html).toContain("<strong>1</strong> test<");
		expect(html).toContain("<strong>1</strong> passed");
		expect(html).toContain("<strong>87.5%</strong> coverage");
	});

	test("lets Russian pick the plural form for the count", () => {
		registerLiteralCatalogLoader(() => ({
			[TESTS]:
				"{count, plural, one {<b>#</b> тест} few {<b>#</b> теста} other {<b>#</b> тестов}}",
		}));
		expect(render("ru", 3)).toContain("<strong>3</strong> теста");
		expect(render("ru", 5)).toContain("<strong>5</strong> тестов");
	});

	test("formats coverage with the German decimal comma and spacing", () => {
		expect(render("de", 2)).toMatch(/<strong>87,5\s%<\/strong>/u);
	});
});
