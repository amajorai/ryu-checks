import { afterEach, describe, expect, test } from "bun:test";
import { registerLiteralCatalogLoader } from "@ryu/i18n/core";
import { I18nProvider } from "@ryu/i18n/react";
import { renderToStaticMarkup } from "react-dom/server";
import { initialLists, initialTests } from "./data.ts";
import { TestListsPage } from "./screens-secondary-test-lists.tsx";

// The Test lists metric cards passed their helpers ("Collections ready to
// run") as bare attribute strings the extractor never read, so they stayed
// English in every locale.

const CATALOGS: Record<string, Record<string, string>> = {
	ar: { "Node-local collections": "مجموعات محلية على هذه العقدة" },
	de: { "UI and API coverage": "UI- und API-Abdeckung" },
	ja: {
		"Collections ready to run": "実行できるコレクション",
		"Node-local collections": "このノードのコレクション",
		"Test lists": "テストリスト",
		"UI and API coverage": "UI と API のカバレッジ",
	},
};

function render(locale: string): string {
	registerLiteralCatalogLoader((requested) =>
		requested.startsWith(locale) ? (CATALOGS[locale] ?? {}) : {}
	);
	return renderToStaticMarkup(
		<I18nProvider
			autoLocalizeDom={false}
			initialLocale={locale}
			initialPackId={null}
		>
			<TestListsPage
				lists={initialLists}
				onCreate={() => undefined}
				onRun={() => undefined}
				onUpdateList={() => undefined}
				tests={initialTests}
			/>
		</I18nProvider>
	);
}

afterEach(() => registerLiteralCatalogLoader(null));

describe("Test lists metric cards", () => {
	test("show the English helpers", () => {
		const html = render("en");
		expect(html).toContain("Collections ready to run");
		expect(html).toContain("UI and API coverage");
	});

	test("translate the label and helpers in Japanese", () => {
		const html = render("ja");
		expect(html).toContain("テストリスト");
		expect(html).toContain("実行できるコレクション");
		expect(html).toContain("UI と API のカバレッジ");
		expect(html).toContain("このノードのコレクション");
		expect(html).not.toContain("Collections ready to run");
	});

	test("translate the helpers in Arabic and German", () => {
		expect(render("ar")).toContain("مجموعات محلية على هذه العقدة");
		expect(render("de")).toContain("UI- und API-Abdeckung");
	});
});
