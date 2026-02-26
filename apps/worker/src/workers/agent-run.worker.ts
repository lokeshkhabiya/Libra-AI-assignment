import type { AgentRunJobData } from "@libra-ai/queue";
import { queueNames, redisConnection } from "@libra-ai/queue";
import { Worker } from "bullmq";

import { logger } from "server/src/agent/logger";
import { runAgentTaskById } from "server/src/agent/runner";

import { publishTaskEvent } from "@/services/task-events";

export const startAgentRunWorker = () => {
	const worker = new Worker<AgentRunJobData>(
		queueNames.agentRun,
		async (job) => {
			const { agentTaskId } = job.data;

			logger.info("worker:agent:job:start", {
				jobId: job.id,
				agentTaskId,
				attemptsMade: job.attemptsMade,
			});

			const startMs = Date.now();

			try {
				await runAgentTaskById(agentTaskId, {
					emit: (event) => {
						void publishTaskEvent(agentTaskId, event as unknown as Record<string, unknown>);
					},
				});

				logger.info("worker:agent:job:done", {
					jobId: job.id,
					agentTaskId,
					durationMs: Date.now() - startMs,
				});
			} catch (error) {
				logger.error("worker:agent:job:error", {
					jobId: job.id,
					agentTaskId,
					durationMs: Date.now() - startMs,
					error: error instanceof Error ? error.message : String(error),
				});
				throw error;
			}
		},
		{
			connection: redisConnection,
			concurrency: 2,
		},
	);

	worker.on("failed", (job, error) => {
		logger.error("worker:agent:job:bullmq:failed", {
			jobId: job?.id,
			agentTaskId: job?.data?.agentTaskId,
			error: error.message,
			attemptsMade: job?.attemptsMade,
		});
	});

	worker.on("error", (error) => {
		logger.error("worker:agent:error", {
			error: error.message,
		});
	});

	logger.info("worker:agent:started", { concurrency: 2 });

	return worker;
};
