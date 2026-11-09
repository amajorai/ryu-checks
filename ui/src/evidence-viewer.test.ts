import { describe, expect, test } from "bun:test";
import { evidenceScreenshotSrc } from "./evidence-viewer.tsx";
import { evidenceArtifactsSchema } from "./schemas.ts";

describe("Checks retained evidence", () => {
	test("parses the sidecar evidence response and builds an inline PNG source", () => {
		const artifacts = evidenceArtifactsSchema.parse({
			id: "evidence-abc",
			level: "live-browser",
			screenshot: { mime: "image/png", data: "iVBORw0KGgo=" },
			domSnapshot: { elements: [{ ref: "@e1", role: "heading" }] },
		});
		expect(evidenceScreenshotSrc(artifacts)).toBe(
			"data:image/png;base64,iVBORw0KGgo="
		);
		expect(artifacts.domSnapshot).toEqual({
			elements: [{ ref: "@e1", role: "heading" }],
		});
	});

	test("reports files the node no longer retains as absent", () => {
		const artifacts = evidenceArtifactsSchema.parse({
			id: "evidence-abc",
			level: "live-browser",
			screenshot: null,
			domSnapshot: null,
		});
		expect(evidenceScreenshotSrc(artifacts)).toBeNull();
	});

	test("rejects a screenshot that is not declared as PNG", () => {
		expect(
			evidenceArtifactsSchema.safeParse({
				id: "evidence-abc",
				level: "live-browser",
				screenshot: { mime: "text/html", data: "PHNjcmlwdD4=" },
			}).success
		).toBe(false);
	});
});
