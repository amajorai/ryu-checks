import { describe, expect, test } from "bun:test";
import { successfulRun } from "../e2e/checks-run.fixture.ts";
import {
	initialLists,
	initialProjects,
	initialSchedules,
	initialTests,
} from "./data.ts";
import {
	agentRunSchema,
	analyticsSchema,
	bootstrapResponseSchema,
	checksAgentReportSchema,
	checksApiFailureSchema,
	checksPlanSchema,
	checksProjectInputSchema,
	checksTestUpdateSchema,
	deletionResponseSchema,
	explorationRecordSchema,
	preserveChecksResponse,
	projectCreationResponseSchema,
	projectSchema,
	scheduleRunResponseSchema,
	testCaseSchema,
} from "./schemas.ts";

const bootstrap = {
	projects: initialProjects,
	tests: initialTests,
	lists: initialLists,
	schedules: initialSchedules,
	agentRuns: [],
	explorations: [],
	runs: [successfulRun],
};
describe("Checks native producer contracts", () => {
	test("accepts the existing complete bootstrap and retains original objects and additive metadata", () => {
		const extra = JSON.parse(
			'{"__proto__":{"retained":true},"native":{"nested":[true,null]}}'
		);
		const value = {
			...bootstrap,
			...extra,
			projects: initialProjects.map((project) => ({
				...project,
				tenant: { ownerUserId: null, orgId: "org-1", nodeId: "node-1" },
				createdAt: "2026-10-06T00:00:00Z",
				runtimeSelection: null,
				latestRunId: null,
				latestExplorationId: null,
			})),
		};
		const parsed = preserveChecksResponse(bootstrapResponseSchema).parse(value);
		expect(Object.is(parsed, value)).toBe(true);
		expect(Object.is(parsed.projects, value.projects)).toBe(true);
		expect(Object.hasOwn(parsed, "__proto__")).toBe(true);
		expect(JSON.stringify(parsed)).toBe(JSON.stringify(value));
		expect(parsed.projects[0]?.runtimeSelection).toBeNull();
	});
	test("validates complete evidence, failures and nullable Rust fields", () => {
		const value = {
			...bootstrap,
			tests: initialTests.map((item) => ({
				...item,
				requestPath: null,
				maxResponseTimeMs: null,
				latestRunId: null,
			})),
			runs: [
				{
					...successfulRun,
					evidence: successfulRun.evidence.map((item) => ({
						...item,
						title: null,
						contentType: null,
					})),
					failures: [
						{
							id: "failure-1",
							testId: "checkout-response",
							title: "Failure",
							failedStep: "Read receipt",
							rootCause: "Unavailable",
							suggestedFix: "Retry",
							source: "live-http",
							evidenceId: "evidence-1",
							screenshotAvailable: false,
							domSnapshot: null,
							healedAt: null,
							healingNote: null,
						},
					],
				},
			],
		};
		expect(bootstrapResponseSchema.safeParse(value).success).toBe(true);
		expect(
			bootstrapResponseSchema.safeParse({
				...value,
				runs: [{ ...successfulRun, evidence: [{ id: "incomplete" }] }],
			}).success
		).toBe(false);
		expect(
			testCaseSchema.safeParse({ ...initialTests[0], steps: [1] }).success
		).toBe(false);
		expect(
			projectSchema.safeParse({ ...initialProjects[0], coverage: "75" }).success
		).toBe(false);
	});
	test("covers native creation, analytics, schedule-run and deletion envelopes", () => {
		expect(
			projectCreationResponseSchema.safeParse({
				project: initialProjects[0],
				tests: initialTests,
			}).success
		).toBe(true);
		expect(
			analyticsSchema.safeParse({
				projects: 3,
				tests: 6,
				runs: 1,
				coverage: 75,
				passed: 1,
				failed: 0,
				failureBuckets: [{ name: "HTTP", count: 1 }],
			}).success
		).toBe(true);
		expect(
			scheduleRunResponseSchema.safeParse({
				schedule: initialSchedules[0],
				runs: [successfulRun],
			}).success
		).toBe(true);
		expect(deletionResponseSchema.safeParse({ deleted: true }).success).toBe(
			true
		);
		expect(deletionResponseSchema.safeParse({ deleted: "true" }).success).toBe(
			false
		);
	});
	test("covers actual agent and exploration records including future evidence labels", () => {
		const agent = {
			id: "agent-1",
			projectId: "run-project-a",
			agentId: "qa",
			status: "completed",
			verdict: "attention",
			evidenceLevel: "future-native",
			transcript: "Verified",
			startedAt: "2026-10-06T00:00:00Z",
			finishedAt: "2026-10-06T00:01:00Z",
			artifacts: [
				{
					kind: "trace",
					label: "Native trace",
					available: true,
					reference: null,
				},
			],
		};
		expect(agentRunSchema.safeParse(agent).success).toBe(true);
		const exploration = {
			id: "explore-1",
			projectId: "run-project-a",
			status: "completed",
			target: "https://checks-fixture.test",
			startedAt: agent.startedAt,
			finishedAt: agent.finishedAt,
			coverage: 50,
			evidenceLevel: "future-native",
			pages: [
				{
					url: "https://checks-fixture.test",
					title: null,
					statusCode: 200,
					responseTimeMs: 12,
					contentType: null,
				},
			],
			featureAreas: [{ name: "Checkout", observed: true, signal: "Receipt" }],
		};
		expect(explorationRecordSchema.safeParse(exploration).success).toBe(true);
		expect(
			explorationRecordSchema.safeParse({
				...exploration,
				pages: [{ url: "missing fields" }],
			}).success
		).toBe(false);
	});
	test("validates complete outbound planning and test-update bodies", () => {
		expect(
			checksProjectInputSchema.safeParse({
				name: "Checkout",
				description: "Verify receipts",
				projectType: "API",
				url: "https://checks-fixture.test",
				testNames: ["Read receipt"],
				runtimeSelection: {
					kind: "model",
					providerId: "native",
					modelId: "qa",
				},
				contextSources: [
					{ kind: "brief", label: "Product", value: "Receipts" },
				],
			}).success
		).toBe(true);
		expect(
			checksProjectInputSchema.safeParse({ name: "missing required fields" })
				.success
		).toBe(false);
		expect(
			checksTestUpdateSchema.safeParse({
				expectedStatus: 200,
				steps: ["GET receipt"],
				assertions: ["Receipt exists"],
			}).success
		).toBe(true);
		expect(
			checksTestUpdateSchema.safeParse({ expectedStatus: "200" }).success
		).toBe(false);
	});
});
describe("Checks model and failure boundaries", () => {
	test("retains ordered valid model cases while skipping invalid rows and capping at twelve", () => {
		expect(
			checksPlanSchema.parse({ cases: [null, 12, "first", {}, "second"] })
		).toEqual(["first", "second"]);
		expect(
			checksPlanSchema.parse({
				cases: Array.from({ length: 20 }, (_, i) => `case-${i}`),
			})
		).toHaveLength(12);
		expect(checksPlanSchema.safeParse({ cases: "invalid" }).success).toBe(
			false
		);
	});
	test("normalizes complete agent artifacts using the original strict availability semantics", () => {
		const result = checksAgentReportSchema.parse({
			artifacts: [
				null,
				{},
				{ kind: "trace", label: "Native", available: "true", reference: null },
				{
					kind: "screenshot",
					label: "Evidence",
					available: true,
					reference: "native://capture",
				},
			],
			evidenceLevel: "live-http",
			verdict: 12,
		});
		expect(result.artifacts).toEqual([
			{
				available: false,
				kind: "trace",
				label: "Native",
				reference: undefined,
			},
			{
				available: true,
				kind: "screenshot",
				label: "Evidence",
				reference: "native://capture",
			},
		]);
		expect(result.evidenceLevel).toBe("live-http");
		expect(result.verdict).toBeUndefined();
		expect(
			checksAgentReportSchema.parse({ artifacts: "bad" }).artifacts
		).toEqual([]);
	});
	test("retains nullish API errors for the existing fallback messages", () => {
		expect(
			checksApiFailureSchema.parse({ error: { code: null, message: null } })
				.error
		).toEqual({ code: null, message: null });
		expect(
			checksApiFailureSchema.parse({
				error: { code: "permission_denied", message: "Denied" },
			}).error?.code
		).toBe("permission_denied");
		expect(checksApiFailureSchema.safeParse({ error: "invalid" }).success).toBe(
			false
		);
	});
});
