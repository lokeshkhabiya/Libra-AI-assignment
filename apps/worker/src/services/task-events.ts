import { redisConnection } from "@libra-ai/queue";

const toTaskChannel = (taskId: string): string => {
	return `task:${taskId}`;
};

export const publishTaskEvent = async (
	taskId: string,
	event: Record<string, unknown>,
): Promise<void> => {
	await redisConnection.publish(toTaskChannel(taskId), JSON.stringify(event));
};
