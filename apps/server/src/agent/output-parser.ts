import { z } from "zod";

import { AGENT_TOOL_NAMES, type FinalizerOutput, type ObserverOutput, type PlannerOutput } from "@/agent/types";

const toolNameSchema = z.enum(AGENT_TOOL_NAMES);

const planStepSchema = z.object({
	description: z.string().min(1).max(400),
	toolName: toolNameSchema,
	toolInput: z.record(z.string(), z.unknown()).default({}),
});

const plannerSchema = z.object({
	steps: z.array(planStepSchema).min(1).max(12),
});

const observerSchema = z.object({
	action: z.enum(["continue", "replan", "finalize"]),
	reasoning: z.string().min(1).max(1200),
	nextSteps: z.array(planStepSchema).default([]),
});

const citationMetadataValueSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null(),
	z.array(z.string()),
]);

const citationSchema = z.object({
	sourceType: z.enum(["WEB", "DRIVE"]),
	title: z.string().nullable().optional(),
	sourceUrl: z.string().url().nullable().optional(),
	excerpt: z.string().nullable().optional(),
	driveFileId: z.string().nullable().optional(),
	rank: z.number().int().nullable().optional(),
	score: z.number().nullable().optional(),
	metadata: z.record(z.string(), citationMetadataValueSchema).nullable().optional(),
});

const finalizerSchema = z.object({
	summary: z.string().min(1).max(4000),
	answerMarkdown: z.string().min(1),
	confidence: z.enum(["low", "medium", "high"]).default("medium"),
	citations: z.array(citationSchema).default([]),
});

const parseWithSchema = <T>(schema: z.ZodSchema<T>, input: unknown, label: string): T => {
	const parsed = schema.safeParse(input);
	if (!parsed.success) {
		throw new Error(`${label} parsing failed: ${parsed.error.message}`);
	}
	return parsed.data;
};

const preprocessObserverPayload = (input: unknown): unknown => {
	if (typeof input !== "object" || !input) {
		return input;
	}

	const obj = input as Record<string, unknown>;
	if (!Array.isArray(obj.nextSteps)) {
		return input;
	}

	const sanitized = obj.nextSteps
		.map((item: unknown) => {
			// LLM sometimes returns strings instead of step objects — drop them
			if (typeof item === "string" || typeof item !== "object" || !item) {
				return null;
			}
			const step = item as Record<string, unknown>;
			// Fill missing description
			if (!step.description || typeof step.description !== "string") {
				const toolHint = typeof step.toolName === "string" ? `Run ${step.toolName}` : "Execute step";
				step.description = toolHint;
			}
			// Ensure toolInput is present
			if (!step.toolInput || typeof step.toolInput !== "object") {
				step.toolInput = {};
			}
			return step;
		})
		.filter(Boolean);

	return { ...obj, nextSteps: sanitized };
};

export const parsePlannerOutput = (input: unknown): PlannerOutput => {
	return parseWithSchema(plannerSchema, input, "Planner");
};

export const parseObserverOutput = (input: unknown): ObserverOutput => {
	const preprocessed = preprocessObserverPayload(input);
	const parsed = parseWithSchema(observerSchema, preprocessed, "Observer");
	if (parsed.action !== "replan") {
		return {
			...parsed,
			nextSteps: [],
		};
	}
	return parsed;
};

export const parseFinalizerOutput = (input: unknown): FinalizerOutput => {
	return parseWithSchema(finalizerSchema, input, "Finalizer");
};
