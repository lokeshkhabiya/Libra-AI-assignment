import { auth } from "@libra-ai/auth";
import { closeQueueConnections } from "@libra-ai/queue";
import { env } from "@libra-ai/env/server";
import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express from "express";

import { errorHandler } from "@/middleware/error";
import driveRouter from "@/routers/drive.router";

const app = express();

app.use(
	cors({
		origin: env.CORS_ORIGIN,
		methods: ["GET", "POST", "DELETE", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Authorization"],
		credentials: true,
	}),
);

app.use(express.json());
app.all("/api/auth{/*path}", toNodeHandler(auth));
app.use("/api/drive", driveRouter);

app.get("/", (_req, res) => {
	res.status(200).send("OK");
});

app.use(errorHandler);

const server = app.listen(3000, () => {
	console.log("Server is running on http://localhost:3000");
});

let shuttingDown = false;

const shutdown = async (signal: string): Promise<void> => {
	if (shuttingDown) {
		return;
	}
	shuttingDown = true;

	console.log(`Received ${signal}, shutting down gracefully...`);
	await closeQueueConnections();

	server.close(() => {
		process.exit(0);
	});
};

process.on("SIGINT", () => {
	void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
	void shutdown("SIGTERM");
});
