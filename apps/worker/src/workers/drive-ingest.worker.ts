import type { DriveIngestJobData } from "@libra-ai/queue";
import { queueNames, redisConnection } from "@libra-ai/queue";
import { Worker } from "bullmq";

import { ingestDriveFile } from "@/services/drive/ingest";

export const startDriveIngestWorker = () => {
	const worker = new Worker<DriveIngestJobData>(
		queueNames.driveIngest,
		async (job) => {
			await ingestDriveFile(job.data);
		},
		{
			connection: redisConnection,
			concurrency: 2,
		},
	);

	worker.on("failed", (job, error) => {
		console.error("drive.ingest failed", {
			jobId: job?.id,
			error: error.message,
		});
	});

	return worker;
};
