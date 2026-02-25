import { Queue, type JobsOptions, type QueueOptions } from "bullmq";
import IORedis from "ioredis";
import type { RedisOptions } from "ioredis";

export const queueNames = {
	agentRun: "agent-run-queue",
	driveSync: "drive-sync-queue",
	driveIngest: "drive-ingest-queue",
} as const;

export type QueueName = (typeof queueNames)[keyof typeof queueNames];

export type AgentRunJobData = {
	agentTaskId: string;
	userId: string;
};

export type AgentRunJobName = "agent.run";

export type DriveSyncJobData = {
	driveConnectionId: string;
	userId: string;
	forceFullSync?: boolean;
};

export type DriveSyncJobName = "drive.sync";

export type DriveIngestJobData = {
	driveFileId: string;
	userId: string;
	forceReingest?: boolean;
};

export type DriveIngestJobName = "drive.ingest";

export const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

export const redisConnectionConfig: RedisOptions = {
	lazyConnect: true,
	maxRetriesPerRequest: null,
	enableReadyCheck: false,
};

export const redisConnection = new IORedis(redisUrl, redisConnectionConfig);

export const defaultJobOptions: JobsOptions = {
	removeOnComplete: 1000,
	removeOnFail: 5000,
};

export const sharedQueueOptions: QueueOptions = {
	connection: redisConnection,
	defaultJobOptions,
};

export const agentRunQueue = new Queue<AgentRunJobData, void, AgentRunJobName>(
	queueNames.agentRun,
	sharedQueueOptions,
);

export const driveSyncQueue = new Queue<DriveSyncJobData, void, DriveSyncJobName>(
	queueNames.driveSync,
	sharedQueueOptions,
);

export const driveIngestQueue = new Queue<DriveIngestJobData, void, DriveIngestJobName>(
	queueNames.driveIngest,
	sharedQueueOptions,
);

export const closeQueueConnections = async () => {
	await Promise.all([agentRunQueue.close(), driveSyncQueue.close(), driveIngestQueue.close()]);
	await redisConnection.quit();
};
