import { createJsonCompletion } from "@/agent/llm";
import { logger } from "@/agent/logger";
import {
	parseFinalizerOutput,
	parseObserverOutput,
	parsePlannerOutput,
} from "@/agent/output-parser";
import {
	buildFinalizerSystemPrompt,
	buildFinalizerUserPrompt,
	buildObserverSystemPrompt,
	buildObserverUserPrompt,
	buildPlannerSystemPrompt,
	buildPlannerUserPrompt,
} from "@/agent/prompts";
import type {
	AgentContext,
	AgentPlanStep,
	CitationInput,
	FinalizationEvidence,
	FinalizerOutput,
	ObserverOutput,
	PlannerOutput,
} from "@/agent/types";
import type { ToolDefinition, ToolResult } from "@/agent/tools/types";

type PlanningBase = {
	taskPrompt: string;
	model?: string;
	ctx: AgentContext;
	tools: ToolDefinition[];
};

type PlannerDriveFile = {
	driveFileId: string;
	name: string;
	mimeType: string;
	lastIndexedAt: string | null;
};

const toPromptTools = (tools: ToolDefinition[]) => {
	return tools.map((tool) => ({
		name: tool.name,
		description: tool.description,
		parameters: tool.parameters,
	}));
};

export const createInitialPlan = async (
	params: PlanningBase & { maxSteps: number; indexedDriveFiles?: PlannerDriveFile[] },
): Promise<PlannerOutput> => {
	const taskId = params.ctx.taskId;

	logger.info("agent:plan:start", {
		taskId,
		maxSteps: params.maxSteps,
		driveFileCount: params.indexedDriveFiles?.length ?? 0,
		promptPreview: params.taskPrompt.slice(0, 120),
	});

	const startMs = Date.now();

	const payload = await createJsonCompletion<unknown>({
		label: "planner",
		signal: params.ctx.abortSignal,
		model: params.model,
		messages: [
			{
				role: "system",
				content: buildPlannerSystemPrompt(toPromptTools(params.tools)),
			},
			{
				role: "user",
				content: buildPlannerUserPrompt({
					taskPrompt: params.taskPrompt,
					maxSteps: params.maxSteps,
					indexedDriveFiles: params.indexedDriveFiles,
				}),
			},
		],
	});

	const result = parsePlannerOutput(payload);

	logger.info("agent:plan:done", {
		taskId,
		stepCount: result.steps.length,
		durationMs: Date.now() - startMs,
		steps: result.steps.map((s) => `${s.toolName}:${s.description.slice(0, 50)}`),
	});

	return result;
};

export const observeAfterStep = async (
	params: PlanningBase & {
		stepNumber: number;
		recentSummaries: string[];
		lastStep: AgentPlanStep;
		lastResult: ToolResult;
		remainingPlannedSteps: AgentPlanStep[];
	},
): Promise<ObserverOutput> => {
	const taskId = params.ctx.taskId;

	logger.info("agent:observe:start", {
		taskId,
		stepNumber: params.stepNumber,
		lastTool: params.lastStep.toolName,
		lastSuccess: params.lastResult.success,
		remainingSteps: params.remainingPlannedSteps.length,
	});

	const startMs = Date.now();

	const payload = await createJsonCompletion<unknown>({
		label: "observer",
		signal: params.ctx.abortSignal,
		model: params.model,
		messages: [
			{
				role: "system",
				content: buildObserverSystemPrompt(toPromptTools(params.tools)),
			},
			{
				role: "user",
				content: buildObserverUserPrompt({
					taskPrompt: params.taskPrompt,
					recentSummaries: params.recentSummaries,
					lastStep: params.lastStep,
					lastResult: params.lastResult,
					remainingPlannedSteps: params.remainingPlannedSteps,
				}),
			},
		],
	});

	const result = parseObserverOutput(payload);

	logger.info("agent:observe:done", {
		taskId,
		stepNumber: params.stepNumber,
		action: result.action,
		reasoning: result.reasoning.slice(0, 120),
		appendedSteps: result.nextSteps.length,
		durationMs: Date.now() - startMs,
	});

	return result;
};

export const finalizeAgentOutput = async (
	params: PlanningBase & {
		evidence: FinalizationEvidence[];
		citations: CitationInput[];
	},
): Promise<FinalizerOutput> => {
	const taskId = params.ctx.taskId;

	logger.info("agent:finalize:llm:start", {
		taskId,
		evidenceCount: params.evidence.length,
		citationCount: params.citations.length,
		successfulSteps: params.evidence.filter((e) => e.success).length,
	});

	const startMs = Date.now();

	const payload = await createJsonCompletion<unknown>({
		label: "finalizer",
		signal: params.ctx.abortSignal,
		model: params.model,
		maxOutputTokens: 2400,
		messages: [
			{
				role: "system",
				content: buildFinalizerSystemPrompt(),
			},
			{
				role: "user",
				content: buildFinalizerUserPrompt({
					taskPrompt: params.taskPrompt,
					evidence: params.evidence,
					citations: params.citations,
				}),
			},
		],
	});

	const result = parseFinalizerOutput(payload);

	logger.info("agent:finalize:llm:done", {
		taskId,
		confidence: result.confidence,
		citationCount: result.citations.length,
		summaryPreview: result.summary.slice(0, 120),
		durationMs: Date.now() - startMs,
	});

	return result;
};
