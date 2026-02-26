import { create } from "zustand";

import {
	cancelAgentTask,
	createAgentTask,
	getAgentTask,
	listAgentTasks,
	streamAgentTask,
	type TaskCitation,
	type TaskDetail,
	type TaskListItem,
	type TaskStatus,
	type TaskStep,
	type TaskStreamEvent,
} from "@/lib/api/agent";

export type PlannedStep = {
	planIndex: number;
	toolName: string | null;
	description: string;
	status: "pending" | "running" | "complete" | "failed";
};

export type ObserveEntry = {
	planStepIndex: number;
	action: "continue" | "replan" | "finalize";
	reasoning: string;
	appendedSteps: number;
};

export type StepEvent = {
	stepNumber: number;
	kind: TaskStep["kind"];
	toolName: string | null;
	description: string;
	status: "pending" | "running" | "complete" | "failed";
	summary?: string;
	input?: unknown;
	output?: unknown;
};

export type ChatMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
	taskId?: string;
	citations?: TaskCitation[];
	status: "pending" | "streaming" | "complete" | "error";
	plannedSteps?: PlannedStep[];
	steps?: StepEvent[];
	observeLog?: ObserveEntry[];
	attachedFileIds?: string[];
	attachedFileLabels?: string[];
};

type ChatStoreState = {
	messages: ChatMessage[];
	tasks: TaskListItem[];
	activeTaskId: string | null;
	isLoadingTasks: boolean;
	isHydratingTask: boolean;
	isStreaming: boolean;
	activeCitationFileId: string | null;
	activeCitationMimeType: string | null;
	attachedFileIds: string[];
	attachedFileNames: Map<string, string>;

	fetchTasks: () => Promise<void>;
	selectTask: (taskId: string) => Promise<void>;
	startNewTask: () => void;
	sendMessage: (prompt: string) => Promise<string | null>;
	cancelActiveTask: () => Promise<void>;
	setActiveCitation: (fileId: string | null, mimeType?: string | null) => void;
	addAttachedFile: (fileId: string, fileName: string) => void;
	removeAttachedFile: (fileId: string) => void;
	clearAttachedFiles: () => void;
	reset: () => void;
};

let cleanupStream: (() => void) | null = null;
let streamTaskId: string | null = null;

const stopTaskStream = (): void => {
	cleanupStream?.();
	cleanupStream = null;
	streamTaskId = null;
};

const isTerminalTaskStatus = (status: TaskStatus): boolean => {
	return status === "COMPLETED" || status === "FAILED" || status === "CANCELED";
};

const toAssistantMessageStatus = (
	status: TaskStatus,
): ChatMessage["status"] => {
	if (status === "COMPLETED") {
		return "complete";
	}
	if (status === "FAILED" || status === "CANCELED") {
		return "error";
	}
	return "streaming";
};

const toStepStatus = (
	status: TaskStep["status"],
): StepEvent["status"] => {
	if (status === "PENDING") {
		return "pending";
	}
	if (status === "RUNNING") {
		return "running";
	}
	if (status === "COMPLETED") {
		return "complete";
	}
	return "failed";
};

const normalizeToolName = (toolName: string | null): string | null => {
	return toolName ? toolName.toLowerCase() : null;
};

const toStepDescription = (step: TaskStep): string => {
	if (step.summary && step.summary.length > 0) {
		return step.summary;
	}

	if (step.toolName) {
		return `${step.kind} • ${step.toolName.toLowerCase()}`;
	}

	return step.kind;
};

const toStepEvents = (steps: TaskStep[]): StepEvent[] => {
	return steps
		.filter((step) => step.kind === "TOOL" || step.kind === "FINALIZE")
		.map((step) => ({
			stepNumber: step.stepNumber,
			kind: step.kind,
			toolName: normalizeToolName(step.toolName),
			description: toStepDescription(step),
			status: toStepStatus(step.status),
			summary: step.summary ?? undefined,
			input: step.input,
			output: step.output,
		}));
};

const toPlannedStepsFromTaskSteps = (steps: TaskStep[]): PlannedStep[] => {
	// Reconstruct planned steps from TOOL steps in a completed task
	// Use a short description — the full summary belongs in the execution log, not the plan
	return steps
		.filter((step) => step.kind === "TOOL")
		.map((step, index) => {
			const raw = step.summary ?? toStepDescription(step);
			// Truncate to first sentence or 120 chars for a clean plan view
			const firstSentence = raw.split(/[.!?]\s/)[0] ?? raw;
			const description = firstSentence.length > 120
				? `${firstSentence.slice(0, 117)}...`
				: firstSentence;
			return {
				planIndex: index,
				toolName: normalizeToolName(step.toolName),
				description,
				status: toStepStatus(step.status),
			};
		});
};

const toObserveLogFromTaskSteps = (steps: TaskStep[]): ObserveEntry[] => {
	// Reconstruct observe log from OBSERVE steps in a completed task
	return steps
		.filter((step) => step.kind === "OBSERVE")
		.map((step, index) => {
			const output = step.output as Record<string, unknown> | null | undefined;
			return {
				planStepIndex: index,
				action: (output?.action as ObserveEntry["action"]) ?? "continue",
				reasoning: step.summary ?? "",
				appendedSteps: 0,
			};
		});
};

const toTaskListItem = (task: TaskDetail): TaskListItem => {
	return {
		id: task.id,
		title: task.title,
		prompt: task.prompt,
		status: task.status,
		model: task.model,
		maxSteps: task.maxSteps,
		stepsCompleted: task.stepsCompleted,
		errorMessage: task.errorMessage,
		startedAt: task.startedAt,
		endedAt: task.endedAt,
		createdAt: task.createdAt,
		updatedAt: task.updatedAt,
	};
};

const upsertTaskListItem = (
	items: TaskListItem[],
	item: TaskListItem,
): TaskListItem[] => {
	const without = items.filter((existing) => existing.id !== item.id);
	return [item, ...without].sort((a, b) => {
		return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
	});
};

const toMessagesFromTask = (task: TaskDetail): ChatMessage[] => {
	const assistantStatus = toAssistantMessageStatus(task.status);
	const citations =
		task.resultJson?.citations && task.resultJson.citations.length > 0
			? task.resultJson.citations
			: task.citations;

	const assistantContent =
		task.resultJson?.answerMarkdown ??
		(assistantStatus === "error"
			? task.errorMessage ?? "Task did not complete successfully."
			: "");

	return [
		{
			id: `${task.id}:user`,
			role: "user",
			content: task.prompt,
			status: "complete",
		},
		{
			id: `${task.id}:assistant`,
			role: "assistant",
			taskId: task.id,
			content: assistantContent,
			status: assistantStatus,
			plannedSteps: toPlannedStepsFromTaskSteps(task.steps),
			steps: toStepEvents(task.steps),
			observeLog: toObserveLogFromTaskSteps(task.steps),
			citations,
		},
	];
};

const parsePlanSteps = (payload: unknown): PlannedStep[] => {
	if (!Array.isArray(payload)) {
		return [];
	}

	return payload.map((item, index) => {
		const step = item as Record<string, unknown>;
		const description =
			typeof step.description === "string" && step.description.length > 0
				? step.description
				: `Planned step ${index + 1}`;
		const toolName =
			typeof step.toolName === "string" ? step.toolName.toLowerCase() : null;

		return {
			planIndex: index,
			toolName,
			description,
			status: "pending" as const,
		};
	});
};

const updatePlannedStepStatus = (
	plannedSteps: PlannedStep[] | undefined,
	planIndex: number,
	status: PlannedStep["status"],
): PlannedStep[] => {
	const current = plannedSteps ?? [];
	const next = [...current];
	if (planIndex >= 0 && planIndex < next.length) {
		next[planIndex] = { ...next[planIndex], status };
	} else {
		// Appended step (from replan) — it won't be in the list, that's fine
	}
	return next;
};

const upsertStreamingStep = (
	steps: StepEvent[] | undefined,
	incoming: StepEvent,
): StepEvent[] => {
	const current = steps ?? [];
	const index = current.findIndex((step) => step.stepNumber === incoming.stepNumber);
	if (index === -1) {
		return [...current, incoming].sort((a, b) => a.stepNumber - b.stepNumber);
	}

	const next = [...current];
	next[index] = {
		...next[index],
		...incoming,
	};
	return next;
};

const markStepComplete = (
	steps: StepEvent[] | undefined,
	params: { stepNumber: number; success: boolean; summary?: string },
): StepEvent[] => {
	const current = steps ?? [];
	const index = current.findIndex((step) => step.stepNumber === params.stepNumber);

	const status: StepEvent["status"] = params.success ? "complete" : "failed";
	if (index === -1) {
		return [
			...current,
			{
				stepNumber: params.stepNumber,
				kind: "TOOL" as const,
				toolName: null,
				description: `Step ${params.stepNumber}`,
				status,
				summary: params.summary,
			},
		].sort((a, b) => a.stepNumber - b.stepNumber);
	}

	const next = [...current];
	next[index] = {
		...next[index],
		status,
		summary: params.summary ?? next[index].summary,
	};
	return next;
};

const setAssistantMessage = (
	messages: ChatMessage[],
	assistantMessageId: string,
	updater: (message: ChatMessage) => ChatMessage,
): ChatMessage[] => {
	return messages.map((message) =>
		message.id === assistantMessageId ? updater(message) : message,
	);
};

export const useChatStore = create<ChatStoreState>((set, get) => {
	const attachTaskStream = (taskId: string, assistantMessageId: string): void => {
		stopTaskStream();
		streamTaskId = taskId;

		cleanupStream = streamAgentTask(
			taskId,
			(event: TaskStreamEvent) => {
				if (streamTaskId !== taskId) {
					return;
				}

				const type = typeof event.type === "string" ? event.type : null;
				if (!type) {
					return;
				}

				if (type === "plan") {
					const plannedSteps = parsePlanSteps(event.steps);
					if (plannedSteps.length === 0) {
						return;
					}

					set((state) => ({
						messages: setAssistantMessage(
							state.messages,
							assistantMessageId,
							(message) => ({
								...message,
								plannedSteps,
								steps: [],
								observeLog: [],
							}),
						),
					}));
					return;
				}

				if (type === "step:start") {
					const stepNumber =
						typeof event.stepNumber === "number" ? event.stepNumber : null;
					if (!stepNumber) {
						return;
					}
					const planStepIndex =
						typeof event.planStepIndex === "number" ? event.planStepIndex : -1;

					set((state) => ({
						messages: setAssistantMessage(
							state.messages,
							assistantMessageId,
							(message) => ({
								...message,
								plannedSteps: updatePlannedStepStatus(
									message.plannedSteps,
									planStepIndex,
									"running",
								),
								steps: upsertStreamingStep(message.steps, {
									stepNumber,
									kind: "TOOL",
									toolName:
										typeof event.toolName === "string"
											? event.toolName.toLowerCase()
											: null,
									description:
										typeof event.description === "string"
											? event.description
											: `Step ${stepNumber}`,
									status: "running",
								}),
							}),
						),
					}));
					return;
				}

				if (type === "step:complete") {
					const stepNumber =
						typeof event.stepNumber === "number" ? event.stepNumber : null;
					if (!stepNumber) {
						return;
					}
					const planStepIndex =
						typeof event.planStepIndex === "number" ? event.planStepIndex : -1;
					const success = Boolean(event.success);
					const summary =
						typeof event.summary === "string" ? event.summary : undefined;

					set((state) => ({
						messages: setAssistantMessage(
							state.messages,
							assistantMessageId,
							(message) => ({
								...message,
								plannedSteps: updatePlannedStepStatus(
									message.plannedSteps,
									planStepIndex,
									success ? "complete" : "failed",
								),
								steps: markStepComplete(message.steps, {
									stepNumber,
									success,
									summary,
								}),
							}),
						),
					}));
					return;
				}

				if (type === "observe") {
					const action = event.action as ObserveEntry["action"] | undefined;
					const reasoning =
						typeof event.reasoning === "string" ? event.reasoning : "";
					const appendedSteps =
						typeof event.appendedSteps === "number" ? event.appendedSteps : 0;

					// Derive planStepIndex from current steps completed count
					set((state) => {
						const msg = state.messages.find((m) => m.id === assistantMessageId);
						const currentPlanStepIndex = msg
							? (msg.observeLog?.length ?? 0)
							: 0;

						return {
							messages: setAssistantMessage(
								state.messages,
								assistantMessageId,
								(message) => {
									// If replanning, append new planned steps
									const newPlannedSteps =
										appendedSteps > 0 && action === "replan"
											? [
												...(message.plannedSteps ?? []),
												...Array.from({ length: appendedSteps }, (_, i) => ({
													planIndex:
														(message.plannedSteps?.length ?? 0) + i,
													toolName: null,
													description: `Additional step ${i + 1}`,
													status: "pending" as const,
												})),
											]
											: message.plannedSteps;

									return {
										...message,
										plannedSteps: newPlannedSteps,
										observeLog: [
											...(message.observeLog ?? []),
											{
												planStepIndex: currentPlanStepIndex,
												action: action ?? "continue",
												reasoning,
												appendedSteps,
											},
										],
									};
								},
							),
						};
					});
					return;
				}

				if (type === "complete") {
					const result = (event.result ?? {}) as Record<string, unknown>;
					const answerMarkdown =
						typeof result.answerMarkdown === "string"
							? result.answerMarkdown
							: "";
					const citations = Array.isArray(result.citations)
						? (result.citations as TaskCitation[])
						: [];

					set((state) => ({
						messages: setAssistantMessage(
							state.messages,
							assistantMessageId,
							(message) => {
								// If plan was missed (race condition), reconstruct from executed steps
								const plannedSteps =
									(message.plannedSteps?.length ?? 0) === 0 &&
									(message.steps?.length ?? 0) > 0
										? (message.steps ?? [])
												.filter((s) => s.kind === "TOOL")
												.map((s, i) => ({
													planIndex: i,
													toolName: s.toolName,
													description: s.summary ?? s.description,
													status: s.status,
												}))
										: message.plannedSteps;

								return {
									...message,
									content: answerMarkdown,
									citations,
									status: "complete",
									plannedSteps,
								};
							},
						),
						isStreaming: false,
					}));
					stopTaskStream();
					void get().fetchTasks();
					return;
				}

				if (type === "error") {
					set((state) => ({
						messages: setAssistantMessage(
							state.messages,
							assistantMessageId,
							(message) => ({
								...message,
								content:
									typeof event.message === "string"
										? event.message
										: "An error occurred while processing the task.",
								status: "error",
							}),
						),
						isStreaming: false,
					}));
					stopTaskStream();
					void get().fetchTasks();
				}
			},
			() => {
				if (streamTaskId !== taskId) {
					return;
				}

				void (async () => {
					try {
						const task = await getAgentTask(taskId);
						const fallbackMessages = toMessagesFromTask(task);
						set((state) => ({
							messages: setAssistantMessage(
								state.messages,
								assistantMessageId,
								(message) => {
									const fallbackAssistant = fallbackMessages[1];
									if (!fallbackAssistant) {
										return message;
									}
									return {
										...message,
										content: fallbackAssistant.content,
										status: fallbackAssistant.status,
										citations: fallbackAssistant.citations,
										plannedSteps: fallbackAssistant.plannedSteps,
										steps: fallbackAssistant.steps,
										observeLog: fallbackAssistant.observeLog,
									};
								},
							),
							isStreaming: !isTerminalTaskStatus(task.status),
							tasks: upsertTaskListItem(state.tasks, toTaskListItem(task)),
						}));
					} catch {
						set((state) => ({
							messages: setAssistantMessage(
								state.messages,
								assistantMessageId,
								(message) => ({
									...message,
									content: "Connection lost. Please try again.",
									status: "error",
								}),
							),
							isStreaming: false,
						}));
					} finally {
						stopTaskStream();
						void get().fetchTasks();
					}
				})();
			},
		);
	};

	return {
		messages: [],
		tasks: [],
		activeTaskId: null,
		isLoadingTasks: false,
		isHydratingTask: false,
		isStreaming: false,
		activeCitationFileId: null,
		activeCitationMimeType: null,
		attachedFileIds: [],
		attachedFileNames: new Map(),

		fetchTasks: async () => {
			set({ isLoadingTasks: true });
			try {
				const response = await listAgentTasks({ page: 1, pageSize: 50 });
				set({
					tasks: response.items,
					isLoadingTasks: false,
				});
			} catch {
				set({ isLoadingTasks: false });
			}
		},

		selectTask: async (taskId: string) => {
			stopTaskStream();
			set({
				isHydratingTask: true,
				activeTaskId: taskId,
				isStreaming: false,
				activeCitationFileId: null,
				activeCitationMimeType: null,
			});

			try {
				const task = await getAgentTask(taskId);
				const messages = toMessagesFromTask(task);
				const assistantMessage = messages.find(
					(message) => message.role === "assistant",
				);

				set((state) => ({
					messages,
					activeTaskId: task.id,
					isStreaming: !isTerminalTaskStatus(task.status),
					tasks: upsertTaskListItem(state.tasks, toTaskListItem(task)),
				}));

				if (!isTerminalTaskStatus(task.status) && assistantMessage) {
					attachTaskStream(task.id, assistantMessage.id);
				}
			} finally {
				set({ isHydratingTask: false });
			}
		},

		startNewTask: () => {
			stopTaskStream();
			set({
				messages: [],
				activeTaskId: null,
				isStreaming: false,
				activeCitationFileId: null,
				activeCitationMimeType: null,
				attachedFileIds: [],
				attachedFileNames: new Map(),
			});
		},

		sendMessage: async (prompt: string) => {
			const state = get();
			if (state.isStreaming) {
				return null;
			}

			stopTaskStream();

			const userMessageId = crypto.randomUUID();
			const assistantMessageId = crypto.randomUUID();
			const attachedFileIds = [...state.attachedFileIds];

			const attachedContext =
				attachedFileIds.length > 0
					? `\n\n[User attached files: ${attachedFileIds
							.map((id) => state.attachedFileNames.get(id) || id)
							.join(", ")}]`
					: "";

			const userMessage: ChatMessage = {
				id: userMessageId,
				role: "user",
				content: prompt,
				status: "complete",
				attachedFileIds,
				attachedFileLabels: attachedFileIds.map(
					(id) => state.attachedFileNames.get(id) || id,
				),
			};

			const assistantMessage: ChatMessage = {
				id: assistantMessageId,
				role: "assistant",
				content: "",
				status: "streaming",
				plannedSteps: [],
				steps: [],
				observeLog: [],
			};

			set({
				messages: [userMessage, assistantMessage],
				activeTaskId: null,
				isStreaming: true,
				activeCitationFileId: null,
				activeCitationMimeType: null,
				attachedFileIds: [],
				attachedFileNames: new Map(),
			});

			try {
				const taskResponse = await createAgentTask({
					prompt: prompt + attachedContext,
				});

				set((current) => ({
					activeTaskId: taskResponse.taskId,
					messages: setAssistantMessage(
						current.messages,
						assistantMessageId,
						(message) => ({
							...message,
							taskId: taskResponse.taskId,
						}),
					),
				}));

				void get().fetchTasks();
				attachTaskStream(taskResponse.taskId, assistantMessageId);
				return taskResponse.taskId;
			} catch (error) {
				set((current) => ({
					messages: setAssistantMessage(
						current.messages,
						assistantMessageId,
						(message) => ({
							...message,
							content:
								error instanceof Error ? error.message : "Failed to send message",
							status: "error",
						}),
					),
					isStreaming: false,
				}));
				return null;
			}
		},

		cancelActiveTask: async () => {
			const taskId = get().activeTaskId;
			if (!taskId) {
				return;
			}

			await cancelAgentTask(taskId);
			stopTaskStream();
			set({ isStreaming: false });
			await get().selectTask(taskId);
			await get().fetchTasks();
		},

		setActiveCitation: (fileId, mimeType) =>
			set({ activeCitationFileId: fileId, activeCitationMimeType: mimeType ?? null }),

		addAttachedFile: (fileId, fileName) =>
			set((state) => {
				if (state.attachedFileIds.includes(fileId)) {
					return state;
				}
				const nextNames = new Map(state.attachedFileNames);
				nextNames.set(fileId, fileName);
				return {
					attachedFileIds: [...state.attachedFileIds, fileId],
					attachedFileNames: nextNames,
				};
			}),

		removeAttachedFile: (fileId) =>
			set((state) => {
				const nextNames = new Map(state.attachedFileNames);
				nextNames.delete(fileId);
				return {
					attachedFileIds: state.attachedFileIds.filter((id) => id !== fileId),
					attachedFileNames: nextNames,
				};
			}),

		clearAttachedFiles: () =>
			set({ attachedFileIds: [], attachedFileNames: new Map() }),

		reset: () => {
			stopTaskStream();
			set({
				messages: [],
				tasks: [],
				activeTaskId: null,
				isLoadingTasks: false,
				isHydratingTask: false,
				isStreaming: false,
				activeCitationFileId: null,
				activeCitationMimeType: null,
				attachedFileIds: [],
				attachedFileNames: new Map(),
			});
		},
	};
});
