import { closeQueueConnections } from "@libra-ai/queue";

import { startWorkers, stopWorkers } from "@/workers";

startWorkers();

console.log("Worker process started");

let shuttingDown = false;

const shutdown = async (signal: string): Promise<void> => {
	if (shuttingDown) {
		return;
	}
	shuttingDown = true;

	console.log(`Received ${signal}, shutting down gracefully...`);
	await stopWorkers();
	await closeQueueConnections();

	process.exit(0);
};

process.on("SIGINT", () => {
	void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
	void shutdown("SIGTERM");
});
