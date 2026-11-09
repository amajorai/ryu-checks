import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Glyph } from "./icons.tsx";

function classTokens(markup: string): string[] {
	return (/class="([^"]*)"/.exec(markup)?.[1] ?? "").split(/\s+/);
}

describe("Glyph", () => {
	test("keeps .glyph and mirrors horizontal arrows as separate classes", () => {
		const tokens = classTokens(
			renderToStaticMarkup(<Glyph name="arrow-right" />)
		);
		expect(tokens).toContain("glyph");
		expect(tokens).toContain("rtl:-scale-x-100");
	});

	test("adds a caller class without gluing it to .glyph", () => {
		const tokens = classTokens(
			renderToStaticMarkup(<Glyph className="size-3" name="arrow-left" />)
		);
		expect(tokens).toEqual(
			expect.arrayContaining(["glyph", "size-3", "rtl:-scale-x-100"])
		);
	});

	test("does not mirror non-directional glyphs", () => {
		const tokens = classTokens(renderToStaticMarkup(<Glyph name="search" />));
		expect(tokens).toContain("glyph");
		expect(tokens).not.toContain("rtl:-scale-x-100");
	});
});
