import { afterEach, describe, expect, test } from "bun:test";
import { registerLiteralCatalogLoader } from "@ryu/i18n/core";
import { I18nProvider } from "@ryu/i18n/react";
import { renderToStaticMarkup } from "react-dom/server";
import { initialProjects, type Project } from "./data.ts";
import { HomePage } from "./screens-dashboard.tsx";

// The Home metric helpers were an untranslated "Persisted on this node" and a
// hand-built English plural ("1 failure bundles need a closer look").

const FAILURES =
	"{count, plural, one {# failure bundle needs a closer look} other {# failure bundles need a closer look}}";

function projectsNeedingAttention(attention: number): Project[] {
	const [first, ...rest] = initialProjects;
	if (!first) {
		throw new Error("initialProjects is empty");
	}
	return [
		{ ...first, attention },
		...rest.map((project) => ({ ...project, attention: 0 })),
	];
}

function render(locale: string, attention: number): string {
	return renderToStaticMarkup(
		<I18nProvider
			autoLocalizeDom={false}
			initialLocale={locale}
			initialPackId={null}
		>
			<HomePage
				analytics={null}
				onNavigate={() => undefined}
				projects={projectsNeedingAttention(attention)}
				runs={[]}
			/>
		</I18nProvider>
	);
}

afterEach(() => registerLiteralCatalogLoader(null));

describe("HomePage metric helpers", () => {
	test("picks the English one and other forms", () => {
		expect(render("en", 1)).toContain("1 failure bundle needs a closer look");
		expect(render("en", 3)).toContain("3 failure bundles need a closer look");
		expect(render("en", 0)).toContain("0 failure bundles need a closer look");
	});

	test("translates the helpers through the catalog", () => {
		registerLiteralCatalogLoader(() => ({
			[FAILURES]:
				"{count, plural, one {# Fehlerpaket braucht einen genaueren Blick} other {# Fehlerpakete brauchen einen genaueren Blick}}",
			"Persisted on this node": "Auf diesem Knoten gespeichert",
		}));
		const one = render("de", 1);
		expect(one).toContain("1 Fehlerpaket braucht einen genaueren Blick");
		expect(one).toContain("Auf diesem Knoten gespeichert");
		expect(render("de", 4)).toContain(
			"4 Fehlerpakete brauchen einen genaueren Blick"
		);
	});
});
