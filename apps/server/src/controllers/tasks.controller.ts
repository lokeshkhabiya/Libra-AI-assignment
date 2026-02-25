import prisma from "@libra-ai/db";
import { agentRunQueue } from "@libra-ai/queue";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import type { AuthenticatedRequest } from "@/middleware/auth";
import { ApiError } from "@/middleware/error";
import { publishTaskEvent, subscribeToTaskEvents } from "@/services/task-events";

const AGENT_RUN_JOB_NAME = "agent.run" as const;

const taskParamSchema = z.object({
	id: z.string().min(1),
});

const createTaskBodySchema = z.object({
	title: z.string().trim().min(1).max(200).optional(),
	prompt: z.string().trim().min(1).max(20_000),
	maxSteps: z.number().int().min(1).max(30).optional(),
	model: z.string().trim().min(1).max(120).optional(),
});

const listTasksQuerySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	pageSize: z.coerce.number().int().min(1).max(100).default(20),
	status: z.enum(["QUEUED", "RUNNING", "COMPLETED", "FAILED", "CANCELED"]).optional(),
});

const ensureAuth = (req: Request): AuthenticatedRequest => {
	const typed = req as AuthenticatedRequest;
	if (!typed.auth?.user?.id) {
		throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
	}
	return typed;
};

const ensureTaskOwnership = async (taskId: string, userId: string) => {
	const task = await prisma.agentTask.findFirst({
		where: {
			id: taskId,
			userId,
		},
	});

	if (!task) {
		throw new ApiError(404, "TASK_NOT_FOUND", "Task not found");
	}

	return task;
};

const toSseData = (payload: unknown): string => {
	return `data: ${JSON.stringify(payload)}\n\n`;
};

export const createTaskController = async (
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> => {
	try {
		const authReq = ensureAuth(req);
		const parsedBody = createTaskBodySchema.safeParse(req.body ?? {});
		if (!parsedBody.success) {
			throw new ApiError(400, "INVALID_PAYLOAD", parsedBody.error.message);
		}

		const task = await prisma.agentTask.create({
			data: {
				userId: authReq.auth.user.id,
				title: parsedBody.data.title,
				prompt: parsedBody.data.prompt,
				maxSteps: parsedBody.data.maxSteps,
				model: parsedBody.data.model,
				status: "QUEUED",
			},
			select: {
				id: true,
				status: true,
				maxSteps: true,
				createdAt: true,
			},
		});

		const jobId = `agent-task:${task.id}`;

		try {
			await agentRunQueue.add(
				AGENT_RUN_JOB_NAME,
				{
					agentTaskId: task.id,
					userId: authReq.auth.user.id,
				},
				{
					jobId,
					attempts: 3,
					backoff: {
						type: "exponential",
						delay: 1000,
					},
				},
			);
		} catch (error) {
			await prisma.agentTask.update({
				where: { id: task.id },
				data: {
					status: "FAILED",
					errorMessage:
						error instanceof Error
							? `Queue enqueue failed: ${error.message}`
							: "Queue enqueue failed",
					endedAt: new Date(),
				},
			});

			throw error;
		}

		await publishTaskEvent(task.id, {
			type: "task:queued",
			taskId: task.id,
			status: "QUEUED",
			timestamp: new Date().toISOString(),
		});

		res.status(202).json({
			taskId: task.id,
			jobId,
			status: task.status,
			maxSteps: task.maxSteps,
			createdAt: task.createdAt,
		});
	} catch (error) {
		next(error);
	}
};

export const listTasksController = async (
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> => {
	try {
		const authReq = ensureAuth(req);
		const parsedQuery = listTasksQuerySchema.safeParse(req.query ?? {});
		if (!parsedQuery.success) {
			throw new ApiError(400, "INVALID_QUERY", parsedQuery.error.message);
		}

		const { page, pageSize, status } = parsedQuery.data;

		const where = {
			userId: authReq.auth.user.id,
			status,
		};

		const [items, total] = await Promise.all([
			prisma.agentTask.findMany({
				where,
				orderBy: {
					createdAt: "desc",
				},
				skip: (page - 1) * pageSize,
				take: pageSize,
				select: {
					id: true,
					title: true,
					prompt: true,
					status: true,
					model: true,
					maxSteps: true,
					stepsCompleted: true,
					errorMessage: true,
					startedAt: true,
					endedAt: true,
					createdAt: true,
					updatedAt: true,
				},
			}),
			prisma.agentTask.count({ where }),
		]);

		res.json({
			page,
			pageSize,
			total,
			items,
		});
	} catch (error) {
		next(error);
	}
};

export const getTaskController = async (
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> => {
	try {
		const authReq = ensureAuth(req);
		const parsedParams = taskParamSchema.safeParse(req.params ?? {});
		if (!parsedParams.success) {
			throw new ApiError(400, "INVALID_TASK_ID", parsedParams.error.message);
		}

		const task = await prisma.agentTask.findFirst({
			where: {
				id: parsedParams.data.id,
				userId: authReq.auth.user.id,
			},
			select: {
				id: true,
				title: true,
				prompt: true,
				model: true,
				status: true,
				maxSteps: true,
				stepsCompleted: true,
				resultJson: true,
				errorMessage: true,
				startedAt: true,
				endedAt: true,
				createdAt: true,
				updatedAt: true,
				steps: {
					orderBy: {
						stepNumber: "asc",
					},
					select: {
						id: true,
						stepNumber: true,
						kind: true,
						toolName: true,
						status: true,
						input: true,
						output: true,
						summary: true,
						startedAt: true,
						endedAt: true,
						createdAt: true,
						updatedAt: true,
					},
				},
				citations: {
					orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
					select: {
						id: true,
						stepId: true,
						sourceType: true,
						title: true,
						sourceUrl: true,
						excerpt: true,
						driveFileId: true,
						rank: true,
						score: true,
						metadata: true,
						createdAt: true,
					},
				},
			},
		});

		if (!task) {
			throw new ApiError(404, "TASK_NOT_FOUND", "Task not found");
		}

		res.json(task);
	} catch (error) {
		next(error);
	}
};

export const streamTaskController = async (
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> => {
	try {
		const authReq = ensureAuth(req);
		const parsedParams = taskParamSchema.safeParse(req.params ?? {});
		if (!parsedParams.success) {
			throw new ApiError(400, "INVALID_TASK_ID", parsedParams.error.message);
		}

		const task = await ensureTaskOwnership(parsedParams.data.id, authReq.auth.user.id);

		res.setHeader("Content-Type", "text/event-stream");
		res.setHeader("Cache-Control", "no-cache");
		res.setHeader("Connection", "keep-alive");
		res.setHeader("X-Accel-Buffering", "no");
		res.flushHeaders?.();

		const writeEvent = (event: unknown): void => {
			res.write(toSseData(event));
		};

		const currentSnapshot = await prisma.agentTask.findUnique({
			where: { id: task.id },
			select: {
				id: true,
				status: true,
				maxSteps: true,
				stepsCompleted: true,
				resultJson: true,
				errorMessage: true,
				startedAt: true,
				endedAt: true,
				updatedAt: true,
			},
		});

		writeEvent({
			type: "snapshot",
			task: currentSnapshot,
		});

		const unsubscribe = await subscribeToTaskEvents(task.id, (event) => {
			writeEvent(event);
		});

		const heartbeat = setInterval(() => {
			res.write(": keepalive\n\n");
		}, 15_000);

		req.on("close", () => {
			clearInterval(heartbeat);
			void unsubscribe();
			res.end();
		});
	} catch (error) {
		if (res.headersSent) {
			res.write(
				toSseData({
					type: "error",
					message: error instanceof Error ? error.message : "Stream initialization failed",
				}),
			);
			res.end();
			return;
		}

		next(error);
	}
};

export const cancelTaskController = async (
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> => {
	try {
		const authReq = ensureAuth(req);
		const parsedParams = taskParamSchema.safeParse(req.params ?? {});
		if (!parsedParams.success) {
			throw new ApiError(400, "INVALID_TASK_ID", parsedParams.error.message);
		}

		const task = await ensureTaskOwnership(parsedParams.data.id, authReq.auth.user.id);

		if (task.status === "COMPLETED" || task.status === "FAILED" || task.status === "CANCELED") {
			res.json({
				taskId: task.id,
				canceled: false,
				status: task.status,
				message: "Task is already terminal",
			});
			return;
		}

		const jobId = `agent-task:${task.id}`;
		let jobRemoved = false;
		try {
			const job = await agentRunQueue.getJob(jobId);
			if (job) {
				const state = await job.getState();
				if (state === "waiting" || state === "delayed" || state === "prioritized") {
					await job.remove();
					jobRemoved = true;
				}
			}
		} catch {
			// Best-effort queue cancellation; DB state still marks task canceled.
		}

		const canceledTask = await prisma.agentTask.update({
			where: { id: task.id },
			data: {
				status: "CANCELED",
				endedAt: new Date(),
				errorMessage: "Canceled by user",
			},
			select: {
				id: true,
				status: true,
				endedAt: true,
			},
		});

		await publishTaskEvent(task.id, {
			type: "task:canceled",
			taskId: task.id,
			status: "CANCELED",
			timestamp: new Date().toISOString(),
		});

		res.json({
			taskId: canceledTask.id,
			canceled: true,
			status: canceledTask.status,
			endedAt: canceledTask.endedAt,
			jobRemoved,
		});
	} catch (error) {
		next(error);
	}
};
