import { expect, test } from "bun:test";
import { formatMessage } from "@ryu/i18n/core";
import type { LiteralMessage } from "@ryu/i18n/react";
import { initialProjects, initialTests, type TestRun } from "./data.ts";
import { terminalOutput } from "./screens-secondary-test-detail.tsx";

// The terminal preview renders inside a <pre>, which the DOM localizer skips,
// so its own words must come from tl(). These tests pin the English text and
// show a reader's catalog reaches every worded line.
const project = initialProjects[0];
const testCase = initialTests.find((item) => item.projectId === project?.id);
if (!(project && testCase)) {
	throw new Error("The workspace fixtures need a project with a test case.");
}

const english: LiteralMessage = (source, values) =>
	formatMessage(source, values ?? {}, "en");

const JA: Record<string, string> = {
	"{count, plural, one {# planned step} other {# planned steps}}":
		"{count} 件の計画ステップ",
	"Ready to run against {url}": "{url} に対して実行できます",
	"Untitled response": "無題の応答",
	"{durationMs} ms · {evidenceLevel}": "{durationMs} ミリ秒 · {evidenceLevel}",
};
const japanese: LiteralMessage = (source, values) =>
	formatMessage(JA[source] ?? source, values ?? {}, "ja");

const run = {
	evidence: [
		{
			domSnapshotAvailable: false,
			id: "e1",
			level: "http",
			observedAt: "2026-01-01T00:00:00Z",
			responseTimeMs: 42,
			screenshotAvailable: false,
			statusCode: 200,
			testId: testCase.id,
			textPreview: "<html>",
			title: null,
			url: project.url,
		},
	],
	evidenceLevel: "http",
} as unknown as TestRun;

test("an unrun case lists its planned steps and target", () => {
	const steps = testCase.steps.length;
	expect(terminalOutput({ project, test: testCase, tl: english })).toBe(
		`${steps} planned ${steps === 1 ? "step" : "steps"}\nReady to run against ${project.url}`
	);
	const ja = terminalOutput({ project, test: testCase, tl: japanese });
	expect(ja).toBe(
		`${steps} 件の計画ステップ\n${project.url} に対して実行できます`
	);
});

test("a run case shows status, title, timing and preview", () => {
	expect(terminalOutput({ project, run, test: testCase, tl: english })).toBe(
		"200 Untitled response\n42 ms · http\n<html>"
	);
	expect(terminalOutput({ project, run, test: testCase, tl: japanese })).toBe(
		"200 無題の応答\n42 ミリ秒 · http\n<html>"
	);
});
