import prisma from "@libra-ai/db";
import { enqueueDriveSyncJob } from "@libra-ai/queue";

const DEFAULT_AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_CONNECTION_BATCH_SIZE = 25;

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
	if (!value) {
		return fallback;
	}

	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}

	return parsed;
};

const resolveAutoSyncIntervalMs = (): number => {
	return parsePositiveInt(
		process.env.DRIVE_AUTO_SYNC_INTERVAL_MS,
		DEFAULT_AUTO_SYNC_INTERVAL_MS,
	);
};

const resolveBatchSize = (): number => {
	return parsePositiveInt(
		process.env.DRIVE_AUTO_SYNC_BATCH_SIZE,
		DEFAULT_CONNECTION_BATCH_SIZE,
	);
};

export const isConnectionDueForAutoSync = (
	lastSyncedAt: Date | null,
	now: Date,
	intervalMs: number,
): boolean => {
	if (!lastSyncedAt) {
		return true;
	}

	return lastSyncedAt.getTime() < now.getTime() - intervalMs;
};

export const startAutoDriveSyncScheduler = (): (() => void) => {
	const intervalMs = resolveAutoSyncIntervalMs();
	const batchSize = resolveBatchSize();
	let running = false;

	const runOnce = async () => {
		if (running) {
			return;
		}

		running = true;
		const now = new Date();
		let queuedCount = 0;
		let dedupedCount = 0;

		try {
			const connections = await prisma.driveConnection.findMany({
				where: {
					status: "CONNECTED",
					OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: new Date(now.getTime() - intervalMs) } }],
				},
				orderBy: [{ lastSyncedAt: "asc" }, { updatedAt: "asc" }],
				take: batchSize,
				select: {
					id: true,
					userId: true,
				},
			});

			for (const connection of connections) {
				const queued = await enqueueDriveSyncJob({
					driveConnectionId: connection.id,
					userId: connection.userId,
					forceFullSync: false,
				});

				if (queued.alreadyQueued) {
					dedupedCount += 1;
				} else {
					queuedCount += 1;
				}
			}

			if (connections.length > 0) {
				console.log("[drive.auto-sync] tick complete", {
					checkedConnections: connections.length,
					queuedCount,
					dedupedCount,
					intervalMs,
					batchSize,
				});
			}
		} catch (error) {
			console.error("[drive.auto-sync] tick failed", {
				error: error instanceof Error ? error.message : String(error),
			});
		} finally {
			running = false;
		}
	};

	void runOnce();
	const intervalHandle = setInterval(() => {
		void runOnce();
	}, intervalMs);

	return () => {
		clearInterval(intervalHandle);
	};
};
