import type { RyuRuntimeSelection } from "@ryu/app-host/app-bridge";
import { z } from "zod";
export const testTypeSchema = z.enum(["UI", "API", "MCP"]);
export const runStatusSchema = z.enum([
	"passed",
	"attention",
	"running",
	"idle",
	"failed",
]);
export const runVerdictSchema = z.enum(["passed", "attention"]);
export const ryuRuntimeSelectionSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("agent"), agentId: z.string() }),
	z.object({
		kind: z.literal("model"),
		modelId: z.string(),
		providerId: z.string(),
	}),
]) satisfies z.ZodType<RyuRuntimeSelection>;
export const tenantScopeSchema = z.object({
	ownerUserId: z.string().nullable().optional(),
	orgId: z.string().nullable().optional(),
	nodeId: z.string().nullable().optional(),
});
export const contextSourceSchema = z.object({
	kind: z.string(),
	label: z.string(),
	value: z.string(),
});
export const testCaseSchema = z.object({
	tenant: tenantScopeSchema.optional(),
	assertions: z.array(z.string()).optional(),
	description: z.string(),
	expectedStatus: z.number().optional(),
	feature: z.string(),
	id: z.string(),
	latestRunId: z.union([z.string(), z.null()]).optional(),
	maxResponseTimeMs: z.union([z.number(), z.null()]).optional(),
	name: z.string(),
	priority: z.union([z.literal("High"), z.literal("Medium"), z.literal("Low")]),
	projectId: z.string(),
	requestMethod: z.string().optional(),
	requestPath: z.union([z.string(), z.null()]).optional(),
	responseAssertions: z.array(z.string()).optional(),
	source: z.string().optional(),
	status: runStatusSchema,
	steps: z.array(z.string()),
	type: testTypeSchema,
	updated: z.string(),
});
export const evidenceRecordSchema = z.object({
	browserNote: z.union([z.string(), z.null()]).optional(),
	contentType: z.union([z.string(), z.null()]).optional(),
	domSnapshotAvailable: z.boolean(),
	id: z.string(),
	level: z.string(),
	observedAt: z.string(),
	renderedTitle: z.union([z.string(), z.null()]).optional(),
	renderedUrl: z.union([z.string(), z.null()]).optional(),
	responseTimeMs: z.number(),
	screenshotAvailable: z.boolean(),
	statusCode: z.number(),
	testId: z.string(),
	textPreview: z.string(),
	title: z.union([z.string(), z.null()]).optional(),
	url: z.string(),
});
export const failureBundleSchema = z.object({
	domSnapshot: z.union([z.string(), z.null()]).optional(),
	evidenceId: z.string(),
	failedStep: z.string(),
	healedAt: z.union([z.string(), z.null()]).optional(),
	healingNote: z.union([z.string(), z.null()]).optional(),
	id: z.string(),
	rootCause: z.string(),
	screenshotAvailable: z.boolean(),
	source: z.string(),
	status: z.string().optional(),
	suggestedFix: z.string(),
	testId: z.string(),
	title: z.string(),
});
/** `GET /evidence/:id`: the retained browser files for one evidence record. */
export const evidenceArtifactsSchema = z.object({
	domSnapshot: z.unknown().optional(),
	id: z.string(),
	level: z.string(),
	screenshot: z
		.object({ data: z.string(), mime: z.literal("image/png") })
		.nullable()
		.optional(),
});
export const testRunSchema = z.object({
	tenant: tenantScopeSchema.optional(),
	coverage: z.number(),
	durationMs: z.number(),
	evidence: z.array(evidenceRecordSchema),
	evidenceLevel: z.string(),
	explorationId: z.union([z.string(), z.null()]).optional(),
	failed: z.number(),
	failures: z.array(failureBundleSchema),
	finishedAt: z.string(),
	id: z.string(),
	passed: z.number(),
	projectId: z.string(),
	scope: z.string().optional(),
	skipped: z.number(),
	startedAt: z.string(),
	status: z.union([
		z.literal("pending"),
		z.literal("running"),
		z.literal("completed"),
		z.literal("failed"),
		z.literal("canceled"),
	]),
	summary: z.string(),
	targetTestId: z.union([z.string(), z.null()]).optional(),
	trigger: z.string(),
	verdict: runVerdictSchema,
});
export const agentArtifactSchema = z.object({
	available: z.boolean(),
	kind: z.string(),
	label: z.string(),
	reference: z.union([z.string(), z.null()]).optional(),
});
export const agentRunSchema = z.object({
	tenant: tenantScopeSchema.optional(),
	agentId: z.string(),
	artifacts: z.array(agentArtifactSchema),
	evidenceLevel: z.string(),
	finishedAt: z.string(),
	id: z.string(),
	projectId: z.string(),
	startedAt: z.string(),
	status: z.string(),
	transcript: z.string(),
	verdict: z.string(),
});
export const featureAreaSchema = z.object({
	name: z.string(),
	observed: z.boolean(),
	signal: z.string(),
});
export const explorationRecordSchema = z.object({
	tenant: tenantScopeSchema.optional(),
	coverage: z.number(),
	evidenceLevel: z.string(),
	featureAreas: z.array(featureAreaSchema),
	finishedAt: z.string(),
	id: z.string(),
	pages: z.array(
		z.object({
			url: z.string(),
			title: z.union([z.string(), z.null()]).optional(),
			statusCode: z.number(),
			responseTimeMs: z.number(),
			contentType: z.union([z.string(), z.null()]).optional(),
		})
	),
	projectId: z.string(),
	startedAt: z.string(),
	status: z.string(),
	target: z.string(),
});
export const testListSchema = z.object({
	tenant: tenantScopeSchema.optional(),
	apiTests: z.number(),
	description: z.string(),
	id: z.string(),
	lastRun: z.string(),
	name: z.string(),
	nextRun: z.string(),
	projectIds: z.array(z.string()).optional(),
	status: runStatusSchema,
	testIds: z.array(z.string()).optional(),
	uiTests: z.number(),
});
export const scheduleSchema = z.object({
	tenant: tenantScopeSchema.optional(),
	nextRunAt: z.string().nullable().optional(),
	lastRunAt: z.string().nullable().optional(),
	executionAuthorization: z.string().nullable().optional(),
	active: z.boolean(),
	createdAt: z.string().optional(),
	frequency: z.string(),
	id: z.string(),
	lastResult: runStatusSchema,
	listId: z.string(),
	listName: z.string(),
	name: z.string(),
	nextRun: z.string(),
});
export const analyticsSchema = z.object({
	coverage: z.number(),
	failed: z.number(),
	failureBuckets: z.array(z.object({ name: z.string(), count: z.number() })),
	passed: z.number(),
	projects: z.number(),
	runs: z.number(),
	tests: z.number(),
});
export const projectSchema = z.object({
	tenant: tenantScopeSchema.optional(),
	attention: z.number(),
	contextSources: z.array(contextSourceSchema).optional(),
	coverage: z.number(),
	createdAt: z.string().optional(),
	description: z.string(),
	id: z.string(),
	lastRun: z.string(),
	latestExplorationId: z.union([z.string(), z.null()]).optional(),
	latestRunId: z.union([z.string(), z.null()]).optional(),
	name: z.string(),
	nextRun: z.string(),
	passed: z.number(),
	runtimeSelection: ryuRuntimeSelectionSchema.nullable().optional(),
	status: runStatusSchema,
	tests: z.number(),
	type: z.union([z.literal("UI"), z.literal("API"), z.literal("Mixed")]),
	updatedAt: z.string().optional(),
	url: z.string(),
});
export const bootstrapResponseSchema = z.object({
	agentRuns: z.array(agentRunSchema),
	explorations: z.array(explorationRecordSchema),
	lists: z.array(testListSchema),
	projects: z.array(projectSchema),
	runs: z.array(testRunSchema),
	schedules: z.array(scheduleSchema),
	tests: z.array(testCaseSchema),
});

/** Keep complete validated producer objects and additive native metadata intact. */
export function preserveChecksResponse<T>(schema: z.ZodType<T>): z.ZodType<T> {
	return z.custom<T>((value) => schema.safeParse(value).success);
}

export const checksApiFailureSchema = z.object({
	error: z
		.object({ code: z.string().nullish(), message: z.string().nullish() })
		.nullish(),
});
export const checksPlanSchema = z
	.object({ cases: z.array(z.string().nullable().catch(null)) })
	.transform((value) =>
		value.cases.filter((value) => value !== null).slice(0, 12)
	);
const agentReportArtifactSchema = z
	.object({
		kind: z.string(),
		label: z.string(),
		available: z.boolean().catch(false),
		reference: z.string().optional().catch(undefined),
	})
	.transform((value) => ({
		available: value.available,
		kind: value.kind,
		label: value.label,
		reference: value.reference,
	}))
	.nullable()
	.catch(null);
export const checksAgentReportSchema = z
	.object({
		artifacts: z.array(agentReportArtifactSchema).catch([]),
		evidenceLevel: z.string().optional().catch(undefined),
		verdict: z.string().optional().catch(undefined),
	})
	.transform((value) => ({
		artifacts: value.artifacts.filter((value) => value !== null),
		evidenceLevel: value.evidenceLevel,
		verdict: value.verdict,
	}));
export const projectCreationResponseSchema = z.object({
	project: projectSchema,
	tests: z.array(testCaseSchema),
});
export const listRunsResponseSchema = z.object({
	runs: z.array(testRunSchema),
});
export const scheduleRunResponseSchema = z.object({
	schedule: scheduleSchema,
	runs: z.array(testRunSchema),
});
export const deletionResponseSchema = z.object({ deleted: z.boolean() });
export type ChecksAppResponse =
	| z.output<typeof bootstrapResponseSchema>
	| z.output<typeof analyticsSchema>
	| z.output<typeof projectCreationResponseSchema>
	| z.output<typeof explorationRecordSchema>
	| z.output<typeof testCaseSchema>
	| z.output<typeof testListSchema>
	| z.output<typeof agentRunSchema>
	| z.output<typeof testRunSchema>
	| z.output<typeof evidenceArtifactsSchema>
	| z.output<typeof listRunsResponseSchema>
	| z.output<typeof scheduleSchema>
	| z.output<typeof scheduleRunResponseSchema>
	| z.output<typeof deletionResponseSchema>;
export const checksProjectInputSchema = z.object({
	name: z.string(),
	description: z.string(),
	projectType: z.enum(["UI", "API", "Mixed"]),
	url: z.string(),
	testNames: z.array(z.string()),
	runtimeSelection: ryuRuntimeSelectionSchema.optional(),
	contextSources: z.array(contextSourceSchema).optional(),
});
export const checksTestUpdateSchema = z.object({
	name: z.string().optional(),
	description: z.string().optional(),
	steps: z.array(z.string()).optional(),
	assertions: z.array(z.string()).optional(),
	priority: z.enum(["High", "Medium", "Low"]).optional(),
	requestMethod: z.string().optional(),
	requestPath: z.string().optional(),
	expectedStatus: z.number().optional(),
	responseAssertions: z.array(z.string()).optional(),
	maxResponseTimeMs: z.number().optional(),
});
export const checksAgentRunInputSchema = z.object({
	agentId: z.string(),
	status: z.string().optional(),
	verdict: z.string().optional(),
	evidenceLevel: z.string().optional(),
	transcript: z.string(),
	artifacts: z.array(agentArtifactSchema).optional(),
});
export const checksListInputSchema = z.object({ name: z.string() });
export const checksListUpdateSchema = z.object({
	testIds: z.array(z.string()),
});
export const checksTriggerInputSchema = z.object({ trigger: z.string() });
export const checksScheduleInputSchema = z.object({
	name: z.string(),
	listId: z.string(),
	frequency: z.string(),
});
export const checksScheduleUpdateSchema = z.object({ active: z.boolean() });
export type ChecksAppRequestBody =
	| z.output<typeof checksProjectInputSchema>
	| z.output<typeof checksTestUpdateSchema>
	| z.output<typeof checksAgentRunInputSchema>
	| z.output<typeof checksListInputSchema>
	| z.output<typeof checksListUpdateSchema>
	| z.output<typeof checksTriggerInputSchema>
	| z.output<typeof checksScheduleInputSchema>
	| z.output<typeof checksScheduleUpdateSchema>;
