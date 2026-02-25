import { redisConnection } from "@libra-ai/queue";

import type { AgentEvent } from "@/agent/types";

type TaskEvent =
	| AgentEvent
	| {
		type: "task:queued" | "task:canceled";
		taskId: string;
		status: "QUEUED" | "CANCELED";
		timestamp: string;
	};

const toTaskChannel = (taskId: string): string => {
	return `task:${taskId}`;
};

const safeParseTaskEvent = (raw: string): TaskEvent | null => {
	try {
		return JSON.parse(raw) as TaskEvent;
	} catch {
		return null;
	}
};

export const publishTaskEvent = async (
	taskId: string,
	event: TaskEvent,
): Promise<void> => {
	await redisConnection.publish(toTaskChannel(taskId), JSON.stringify(event));
};

export const subscribeToTaskEvents = async (
	taskId: string,
	onEvent: (event: TaskEvent) => void,
): Promise<() => Promise<void>> => {
	const subscriber = redisConnection.duplicate();
	const channel = toTaskChannel(taskId);

	subscriber.on("message", (messageChannel, rawMessage) => {
		if (messageChannel !== channel) {
			return;
		}

		const event = safeParseTaskEvent(rawMessage);
		if (event) {
			onEvent(event);
		}
	});
	await subscriber.subscribe(channel);

	return async () => {
		try {
			await subscriber.unsubscribe(channel);
		} finally {
			if (subscriber.status === "end") {
				return;
			}

			if (subscriber.status === "wait") {
				// No connection was established.
				return;
			}

			await subscriber.quit();
		}
	};
};
