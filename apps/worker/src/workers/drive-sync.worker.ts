import type { DriveSyncJobData } from "@libra-ai/queue";
import { queueNames, redisConnection } from "@libra-ai/queue";
import { Worker } from "bullmq";

import { runDriveSync } from "@/services/drive/sync";

export const startDriveSyncWorker = () => {
	const worker = new Worker<DriveSyncJobData>(
		queueNames.driveSync,
		async (job) => {
			await runDriveSync(job.data);
		},
		{
			connection: redisConnection,
			concurrency: 2,
		},
	);

	worker.on("failed", (job, error) => {
		console.error("drive.sync failed", {
			jobId: job?.id,
			error: error.message,
		});
	});

	return worker;
};
