import type { AgentContext, AgentEvent } from "@/agent/types";

type CreateAgentContextParams = {
	taskId: string;
	userId: string;
	abortSignal?: AbortSignal;
	emit?: (event: AgentEvent) => void;
};

const noop = (_event: AgentEvent): void => {};

export const createAgentContext = (params: CreateAgentContextParams): AgentContext => {
	const controller = new AbortController();

	return {
		taskId: params.taskId,
		userId: params.userId,
		abortSignal: params.abortSignal ?? controller.signal,
		emit: params.emit ?? noop,
	};
};
