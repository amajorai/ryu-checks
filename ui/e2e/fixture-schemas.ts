import { z } from "zod";
import {
	agentArtifactSchema,
	bootstrapResponseSchema,
	checksTestUpdateSchema,
	contextSourceSchema,
	preserveChecksResponse,
	ryuRuntimeSelectionSchema,
} from "../src/schemas.ts";

const callBodySchema = checksTestUpdateSchema.extend({
	projectType: z.enum(["UI", "API", "Mixed"]).optional(),
	url: z.string().optional(),
	testNames: z.array(z.string()).optional(),
	runtimeSelection: ryuRuntimeSelectionSchema.optional(),
	contextSources: z.array(contextSourceSchema).optional(),
	agentId: z.string().optional(),
	status: z.string().optional(),
	verdict: z.string().optional(),
	evidenceLevel: z.string().optional(),
	transcript: z.string().optional(),
	artifacts: z.array(agentArtifactSchema).optional(),
	testIds: z.array(z.string()).optional(),
	trigger: z.string().optional(),
	listId: z.string().optional(),
	frequency: z.string().optional(),
	active: z.boolean().optional(),
});
export const checksFixtureCallSchema = z.object({
	method: z.string(),
	path: z.string(),
	body: callBodySchema.optional(),
});
const runFixtureSchema = z.object({
	calls: z.array(checksFixtureCallSchema),
	executions: z.number().int().nonnegative(),
	state: bootstrapResponseSchema,
	unknownRequests: z.array(checksFixtureCallSchema),
});
declare global {
	interface Window {
		__checksFixtureSchemas?: {
			bootstrap: typeof bootstrapResponseSchema.parse;
			run: typeof runFixtureSchema.parse;
			testUpdate: typeof checksTestUpdateSchema.parse;
		};
	}
}
window.__checksFixtureSchemas = {
	bootstrap(value) {
		return preserveChecksResponse(bootstrapResponseSchema).parse(value);
	},
	run(value) {
		return preserveChecksResponse(runFixtureSchema).parse(value);
	},
	testUpdate(value) {
		return preserveChecksResponse(checksTestUpdateSchema).parse(value);
	},
};
