import prisma from "@libra-ai/db";
import { sanitizeDbText } from "@libra-ai/drive-core";

import { createAgentContext } from "@/agent/context";
import { finalizeAgentOutput, createInitialPlan, observeAfterStep } from "@/agent/planner";
import { getRegisteredTools, getTool } from "@/agent/tools/registry";
import type { ToolResult } from "@/agent/tools/types";
import type {
	AgentContext,
	AgentEvent,
	AgentPlanStep,
	AgentTaskRuntime,
	CitationInput,
	FinalizationEvidence,
	FinalizerOutput,
	ObserverOutput,
} from "@/agent/types";
import { toPrismaToolName } from "@/agent/types";

const RECENT_SUMMARY_WINDOW = 6;
const MAX_RESULT_CHARS_FOR_PROMPT = 4000;

type RunAgentOptions = {
	abortSignal?: AbortSignal;
	emit?: (event: AgentEvent) => void;
};

const asJson = (value: unknown): never => {
	return value as never;
};

const truncate = (value: string, maxChars: number): string => {
	if (value.length <= maxChars) {
		return value;
	}

	return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
};

const stringifyForPrompt = (value: unknown): string => {
	try {
		const text = JSON.stringify(value);
		if (typeof text === "string") {
			return text;
		}
	} catch {
		// Ignore and fallback below.
	}

	return String(value);
};

const safeErrorMessage = (error: unknown): string => {
	const raw = error instanceof Error ? error.message : String(error);
	return sanitizeDbText(raw);
};

const isAbortError = (error: unknown): boolean => {
	if (error instanceof DOMException && error.name === "AbortError") {
		return true;
	}

	if (!(error instanceof Error)) {
		return false;
	}

	return (
		error.name === "AbortError" ||
		error.message.toLowerCase().includes("aborted") ||
		error.message.toLowerCase().includes("cancel")
	);
};

const toStepSummary = (step: AgentPlanStep, result: ToolResult): string => {
	const status = result.success ? "completed" : "failed";
	const resultSummary = truncate(stringifyForPrompt(result.data), 500);
	return sanitizeDbText(
		`${step.description} via ${step.toolName} ${status}. Output: ${resultSummary}`,
	);
};

const normalizeMetadata = (
	metadata: CitationInput["metadata"],
): CitationInput["metadata"] | undefined => {
	if (!metadata) {
		return undefined;
	}

	const normalizedEntries: Array<[string, string | number | boolean | null | string[]]> = [];
	for (const [key, rawValue] of Object.entries(metadata)) {
		if (
			typeof rawValue === "string" ||
			typeof rawValue === "number" ||
			typeof rawValue === "boolean" ||
			rawValue === null
		) {
			normalizedEntries.push([key, rawValue]);
			continue;
		}

		if (Array.isArray(rawValue) && rawValue.every((item) => typeof item === "string")) {
			normalizedEntries.push([key, rawValue]);
		}
	}

	if (normalizedEntries.length === 0) {
		return undefined;
	}

	return Object.fromEntries(normalizedEntries);
};

const normalizeCitations = (
	citations: CitationInput[] | undefined,
	startingRank: number,
): CitationInput[] => {
	if (!citations || citations.length === 0) {
		return [];
	}

	return citations.map((citation, index) => ({
		sourceType: citation.sourceType,
		title: citation.title ? sanitizeDbText(citation.title) : null,
		sourceUrl: citation.sourceUrl ?? null,
		excerpt: citation.excerpt ? sanitizeDbText(citation.excerpt) : null,
		driveFileId: citation.driveFileId ?? null,
		rank: citation.rank ?? startingRank + index + 1,
		score: citation.score ?? null,
		metadata: normalizeMetadata(citation.metadata) ?? null,
	}));
};

const dedupeCitations = (citations: CitationInput[]): CitationInput[] => {
	const seen = new Set<string>();
	const deduped: CitationInput[] = [];

	for (const citation of citations) {
		const key = [
			citation.sourceType,
			citation.title ?? "",
			citation.sourceUrl ?? "",
			citation.driveFileId ?? "",
			citation.excerpt ?? "",
		].join("|");

		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		deduped.push(citation);
	}

	return deduped;
};

const fallbackFinalResult = (
	taskPrompt: string,
	evidence: FinalizationEvidence[],
	citations: CitationInput[],
): FinalizerOutput => {
	const evidenceSummary =
		evidence.length === 0
			? "No evidence was produced by tool execution."
			: evidence
					.map((item) => `Step ${item.stepNumber}: ${item.summary}`)
					.slice(0, 6)
					.join("\n");

	return {
		summary: "Agent run completed with fallback summarization.",
		answerMarkdown: [
			`Task: ${taskPrompt}`,
			"",
			"### Execution Summary",
			evidenceSummary,
		].join("\n"),
		confidence: evidence.length > 0 ? "medium" : "low",
		citations,
	};
};

const loadTask = async (taskId: string): Promise<AgentTaskRuntime> => {
	const task = await prisma.agentTask.findUnique({
		where: { id: taskId },
		select: {
			id: true,
			userId: true,
			prompt: true,
			maxSteps: true,
			model: true,
		},
	});

	if (!task) {
		throw new Error(`Agent task ${taskId} not found`);
	}

	return task;
};

const persistTaskCitations = async (
	taskId: string,
	stepId: string,
	citations: CitationInput[],
): Promise<void> => {
	await prisma.taskCitation.deleteMany({
		where: {
			taskId,
		},
	});

	if (citations.length === 0) {
		return;
	}

	await prisma.taskCitation.createMany({
		data: citations.map((citation, index) => ({
			taskId,
			stepId,
			sourceType: citation.sourceType,
			title: citation.title ?? null,
			sourceUrl: citation.sourceUrl ?? null,
			excerpt: citation.excerpt ?? null,
			driveFileId: citation.driveFileId ?? null,
			rank: citation.rank ?? index + 1,
			score: citation.score ?? null,
			metadata: citation.metadata ? asJson(citation.metadata) : undefined,
		})),
	});
};

export const runAgentTaskById = async (
	taskId: string,
	options: RunAgentOptions = {},
): Promise<FinalizerOutput> => {
	const task = await loadTask(taskId);
	const ctx = createAgentContext({
		taskId: task.id,
		userId: task.userId,
		abortSignal: options.abortSignal,
		emit: options.emit,
	});

	return runAgentTask(task, ctx);
};

export const runAgentTask = async (
	task: AgentTaskRuntime,
	ctx: AgentContext,
): Promise<FinalizerOutput> => {
	const tools = getRegisteredTools();
	let stepNumber = 1;
	let stepsCompleted = 0;

	const pendingPlanSteps: AgentPlanStep[] = [];
	const recentSummaries: string[] = [];
	const evidence: FinalizationEvidence[] = [];
	const gatheredCitations: CitationInput[] = [];

	try {
		await prisma.agentTask.update({
			where: { id: task.id },
			data: {
				status: "RUNNING",
				startedAt: new Date(),
				endedAt: null,
				errorMessage: null,
				stepsCompleted: 0,
			},
		});

		ctx.emit({
			type: "task:start",
			taskId: task.id,
			maxSteps: task.maxSteps,
		});

		const plan = await createInitialPlan({
			taskPrompt: task.prompt,
			maxSteps: task.maxSteps,
			model: task.model ?? undefined,
			ctx,
			tools,
		});

		pendingPlanSteps.push(...plan.steps);

		await prisma.agentStep.create({
			data: {
				taskId: task.id,
				stepNumber: stepNumber++,
				kind: "PLAN",
				status: "COMPLETED",
				summary: sanitizeDbText(`Generated plan with ${plan.steps.length} steps`),
				output: asJson(plan),
				startedAt: new Date(),
				endedAt: new Date(),
			},
		});

		ctx.emit({
			type: "plan",
			taskId: task.id,
			steps: plan.steps,
		});

		while (pendingPlanSteps.length > 0 && stepsCompleted < task.maxSteps) {
			if (ctx.abortSignal.aborted) {
				throw new Error("Agent run aborted");
			}

			const currentStep = pendingPlanSteps.shift();
			if (!currentStep) {
				break;
			}

			const tool = getTool(currentStep.toolName);
			if (!tool) {
				const missingSummary = sanitizeDbText(
					`Tool ${currentStep.toolName} is not registered`,
				);
				await prisma.agentStep.create({
					data: {
						taskId: task.id,
						stepNumber: stepNumber++,
						kind: "TOOL",
						toolName: toPrismaToolName(currentStep.toolName),
						status: "FAILED",
						summary: missingSummary,
						input: asJson(currentStep.toolInput),
						output: asJson({
							success: false,
							error: missingSummary,
						}),
						startedAt: new Date(),
						endedAt: new Date(),
					},
				});

				stepsCompleted += 1;
				await prisma.agentTask.update({
					where: { id: task.id },
					data: {
						stepsCompleted,
					},
				});
				continue;
			}

			const runningStep = await prisma.agentStep.create({
				data: {
					taskId: task.id,
					stepNumber: stepNumber++,
					kind: "TOOL",
					toolName: toPrismaToolName(currentStep.toolName),
					status: "RUNNING",
					summary: sanitizeDbText(currentStep.description),
					input: asJson(currentStep.toolInput),
					startedAt: new Date(),
				},
			});

			ctx.emit({
				type: "step:start",
				taskId: task.id,
				stepId: runningStep.id,
				stepNumber: runningStep.stepNumber,
				toolName: currentStep.toolName,
				description: currentStep.description,
			});

			let toolResult: ToolResult;
			try {
				toolResult = await tool.execute(currentStep.toolInput, ctx);
			} catch (error) {
				toolResult = {
					success: false,
					data: {
						error: safeErrorMessage(error),
					},
				};
			}

			const toolSummary = toStepSummary(currentStep, toolResult);
			const stepStatus = toolResult.success ? "COMPLETED" : "FAILED";
			await prisma.agentStep.update({
				where: {
					id: runningStep.id,
				},
				data: {
					status: stepStatus,
					summary: toolSummary,
					output: asJson(toolResult),
					endedAt: new Date(),
				},
			});

			stepsCompleted += 1;
			await prisma.agentTask.update({
				where: { id: task.id },
				data: {
					stepsCompleted,
				},
			});

			ctx.emit({
				type: "step:complete",
				taskId: task.id,
				stepId: runningStep.id,
				stepNumber: runningStep.stepNumber,
				toolName: currentStep.toolName,
				success: toolResult.success,
				summary: toolSummary,
			});

			recentSummaries.push(truncate(toolSummary, 1000));
			if (recentSummaries.length > RECENT_SUMMARY_WINDOW) {
				recentSummaries.shift();
			}

			evidence.push({
				stepNumber: runningStep.stepNumber,
				description: currentStep.description,
				toolName: currentStep.toolName,
				success: toolResult.success,
				summary: truncate(toolSummary, 600),
				result: truncate(stringifyForPrompt(toolResult.data), MAX_RESULT_CHARS_FOR_PROMPT),
			});

			const normalizedCitations = normalizeCitations(
				toolResult.citations,
				gatheredCitations.length,
			);
			if (normalizedCitations.length > 0) {
				gatheredCitations.push(...normalizedCitations);
			}

			if (stepsCompleted >= task.maxSteps || ctx.abortSignal.aborted) {
				break;
			}

			let observation: ObserverOutput = {
				action: "continue",
				reasoning: "Continuing with remaining plan.",
				nextSteps: [],
			};

			try {
				observation = await observeAfterStep({
					taskPrompt: task.prompt,
					model: task.model ?? undefined,
					ctx,
					tools,
					recentSummaries,
					lastStep: currentStep,
					lastResult: toolResult,
					remainingPlannedSteps: pendingPlanSteps,
				});
			} catch (error) {
				observation = {
					action: "continue",
					reasoning: `Observer failed: ${safeErrorMessage(error)}. Continuing.`,
					nextSteps: [],
				};
			}

			await prisma.agentStep.create({
				data: {
					taskId: task.id,
					stepNumber: stepNumber++,
					kind: "OBSERVE",
					status: "COMPLETED",
					summary: truncate(sanitizeDbText(observation.reasoning), 1000),
					output: asJson(observation),
					startedAt: new Date(),
					endedAt: new Date(),
				},
			});

			const appendedSteps = observation.action === "replan" ? observation.nextSteps.length : 0;
			if (appendedSteps > 0) {
				pendingPlanSteps.push(...observation.nextSteps);
			}

			ctx.emit({
				type: "observe",
				taskId: task.id,
				action: observation.action,
				reasoning: observation.reasoning,
				appendedSteps,
			});

			if (observation.action === "finalize") {
				break;
			}
		}

		const finalStep = await prisma.agentStep.create({
			data: {
				taskId: task.id,
				stepNumber: stepNumber++,
				kind: "FINALIZE",
				status: "RUNNING",
				summary: "Synthesizing final answer",
				startedAt: new Date(),
			},
		});

		let finalResult: FinalizerOutput;
		try {
			finalResult = await finalizeAgentOutput({
				taskPrompt: task.prompt,
				model: task.model ?? undefined,
				ctx,
				tools,
				evidence,
				citations: gatheredCitations,
			});
		} catch {
			finalResult = fallbackFinalResult(task.prompt, evidence, gatheredCitations);
		}

		const finalCitations = dedupeCitations(
			normalizeCitations(
				finalResult.citations.length > 0 ? finalResult.citations : gatheredCitations,
				0,
			),
		);

		const normalizedFinalResult: FinalizerOutput = {
			...finalResult,
			citations: finalCitations,
		};

		await prisma.agentStep.update({
			where: { id: finalStep.id },
			data: {
				status: "COMPLETED",
				summary: truncate(sanitizeDbText(normalizedFinalResult.summary), 1000),
				output: asJson(normalizedFinalResult),
				endedAt: new Date(),
			},
		});

		await persistTaskCitations(task.id, finalStep.id, finalCitations);

		await prisma.agentTask.update({
			where: { id: task.id },
			data: {
				status: "COMPLETED",
				stepsCompleted,
				endedAt: new Date(),
				resultJson: asJson(normalizedFinalResult),
				errorMessage: null,
			},
		});

		ctx.emit({
			type: "complete",
			taskId: task.id,
			result: normalizedFinalResult,
		});

		return normalizedFinalResult;
	} catch (error) {
		const canceled = ctx.abortSignal.aborted || isAbortError(error);
		const errorMessage = safeErrorMessage(error);

		await prisma.agentTask.update({
			where: { id: task.id },
			data: {
				status: canceled ? "CANCELED" : "FAILED",
				endedAt: new Date(),
				errorMessage,
				stepsCompleted,
			},
		});

		ctx.emit({
			type: "error",
			taskId: task.id,
			message: errorMessage,
		});

		throw error;
	}
};
