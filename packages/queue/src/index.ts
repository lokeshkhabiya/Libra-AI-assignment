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

const DRIVE_SYNC_JOB_STATES = ["waiting", "active", "delayed", "prioritized"] as const;

export const selectQueuedDriveSyncJob = (
	jobs: Array<{ id?: string | number | null; data: { driveConnectionId?: string } }>,
	driveConnectionId: string,
): { id: string } | null => {
	const matchingJob = jobs.find((job) => job.data.driveConnectionId === driveConnectionId);
	if (!matchingJob || matchingJob.id === null || matchingJob.id === undefined) {
		return null;
	}

	return { id: String(matchingJob.id) };
};

export const findQueuedDriveSyncJob = async (
	driveConnectionId: string,
): Promise<{ id: string } | null> => {
	const jobs = await driveSyncQueue.getJobs([...DRIVE_SYNC_JOB_STATES]);
	return selectQueuedDriveSyncJob(jobs, driveConnectionId);
};

export const enqueueDriveSyncJob = async (params: {
	driveConnectionId: string;
	userId: string;
	forceFullSync: boolean;
}): Promise<{ jobId: string; alreadyQueued: boolean }> => {
	const queuedJob = await findQueuedDriveSyncJob(params.driveConnectionId);
	if (queuedJob) {
		return {
			jobId: queuedJob.id,
			alreadyQueued: true,
		};
	}

	const queuedAt = Date.now();
	const job = await driveSyncQueue.add(
		"drive.sync",
		{
			driveConnectionId: params.driveConnectionId,
			userId: params.userId,
			forceFullSync: params.forceFullSync,
		},
		{
			jobId: `sync-${params.driveConnectionId}-${queuedAt}`,
			attempts: 3,
			backoff: {
				type: "exponential",
				delay: 1500,
			},
		},
	);

	return {
		jobId: String(job.id),
		alreadyQueued: false,
	};
};

export const closeQueueConnections = async () => {
	await Promise.all([agentRunQueue.close(), driveSyncQueue.close(), driveIngestQueue.close()]);
	await redisConnection.quit();
};
