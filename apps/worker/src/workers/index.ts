import type { Worker } from "bullmq";

import { startDriveIngestWorker } from "./drive-ingest.worker";
import { startDriveSyncWorker } from "./drive-sync.worker";

let workers: Worker[] = [];

export const startWorkers = () => {
	if (workers.length > 0) {
		return;
	}

	workers = [startDriveSyncWorker(), startDriveIngestWorker()];
};

export const stopWorkers = async () => {
	await Promise.all(workers.map((worker) => worker.close()));
	workers = [];
};
