import { driveIngestQueue, driveSyncQueue, redisConnection } from "@libra-ai/queue";

async function main() {
  console.log("Draining drive-ingest-queue and drive-sync-queue...");

  // true = also clean active jobs; they will be discarded
  await driveIngestQueue.drain(true);
  await driveSyncQueue.drain(true);

  console.log("Queues drained.");
  await redisConnection.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});