import { createJsonCompletion } from "@/agent/llm";
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

const toPromptTools = (tools: ToolDefinition[]) => {
	return tools.map((tool) => ({
		name: tool.name,
		description: tool.description,
		parameters: tool.parameters,
	}));
};

export const createInitialPlan = async (
	params: PlanningBase & { maxSteps: number },
): Promise<PlannerOutput> => {
	const payload = await createJsonCompletion<unknown>({
		signal: params.ctx.abortSignal,
		model: params.model,
		messages: [
			{
				role: "system",
				content: buildPlannerSystemPrompt(toPromptTools(params.tools)),
			},
			{
				role: "user",
				content: buildPlannerUserPrompt(params.taskPrompt, params.maxSteps),
			},
		],
	});

	return parsePlannerOutput(payload);
};

export const observeAfterStep = async (
	params: PlanningBase & {
		recentSummaries: string[];
		lastStep: AgentPlanStep;
		lastResult: ToolResult;
		remainingPlannedSteps: AgentPlanStep[];
	},
): Promise<ObserverOutput> => {
	const payload = await createJsonCompletion<unknown>({
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

	return parseObserverOutput(payload);
};

export const finalizeAgentOutput = async (
	params: PlanningBase & {
		evidence: FinalizationEvidence[];
		citations: CitationInput[];
	},
): Promise<FinalizerOutput> => {
	const payload = await createJsonCompletion<unknown>({
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

	return parseFinalizerOutput(payload);
};
