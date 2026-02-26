import { env } from "@libra-ai/env/web";

const SERVER_URL = env.NEXT_PUBLIC_SERVER_URL;

export type TaskStatus =
	| "QUEUED"
	| "RUNNING"
	| "COMPLETED"
	| "FAILED"
	| "CANCELED";

export type CreateTaskPayload = {
	prompt: string;
	title?: string;
	maxSteps?: number;
	model?: string;
};

export type TaskResponse = {
	taskId: string;
	jobId: string;
	status: TaskStatus;
	maxSteps: number;
	createdAt: string;
};

export type TaskCitation = {
	id: string;
	sourceType: "WEB" | "DRIVE";
	title: string | null;
	sourceUrl: string | null;
	excerpt: string | null;
	driveFileId: string | null;
	rank: number | null;
	score: number | null;
	metadata: Record<string, unknown> | null;
};

export type TaskStep = {
	id: string;
	stepNumber: number;
	kind: "PLAN" | "TOOL" | "OBSERVE" | "FINALIZE";
	toolName: string | null;
	status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";
	input: unknown;
	output: unknown;
	summary: string | null;
	startedAt: string | null;
	endedAt: string | null;
};

export type TaskListItem = {
	id: string;
	title: string | null;
	prompt: string;
	status: TaskStatus;
	model: string | null;
	maxSteps: number;
	stepsCompleted: number;
	errorMessage: string | null;
	startedAt: string | null;
	endedAt: string | null;
	createdAt: string;
	updatedAt: string;
};

export type TaskListResponse = {
	page: number;
	pageSize: number;
	total: number;
	items: TaskListItem[];
};

export type TaskDetail = {
	id: string;
	title: string | null;
	prompt: string;
	model: string | null;
	status: TaskStatus;
	maxSteps: number;
	stepsCompleted: number;
	resultJson: {
		summary: string;
		answerMarkdown: string;
		confidence: string;
		citations: TaskCitation[];
	} | null;
	errorMessage: string | null;
	startedAt: string | null;
	endedAt: string | null;
	createdAt: string;
	updatedAt: string;
	steps: TaskStep[];
	citations: TaskCitation[];
};

const apiFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
	const response = await fetch(`${SERVER_URL}${path}`, {
		credentials: "include",
		headers: {
			"Content-Type": "application/json",
			...(init?.headers ?? {}),
		},
		...init,
	});

	if (!response.ok) {
		const fallbackMessage = `${response.status} ${response.statusText}`;
		let message = fallbackMessage;
		try {
			const payload = (await response.json()) as { message?: string };
			message = payload.message ?? fallbackMessage;
		} catch {
			// Ignore
		}
		throw new Error(message);
	}

	return (await response.json()) as T;
};

export const createAgentTask = async (payload: CreateTaskPayload): Promise<TaskResponse> => {
	return apiFetch<TaskResponse>("/api/tasks", {
		method: "POST",
		body: JSON.stringify(payload),
	});
};

export const listAgentTasks = async (params?: {
	page?: number;
	pageSize?: number;
	status?: TaskStatus;
}): Promise<TaskListResponse> => {
	const searchParams = new URLSearchParams();
	if (params?.page) {
		searchParams.set("page", String(params.page));
	}
	if (params?.pageSize) {
		searchParams.set("pageSize", String(params.pageSize));
	}
	if (params?.status) {
		searchParams.set("status", params.status);
	}

	const query = searchParams.toString();
	const path = query.length > 0 ? `/api/tasks?${query}` : "/api/tasks";
	return apiFetch<TaskListResponse>(path, {
		method: "GET",
	});
};

export const getAgentTask = async (taskId: string): Promise<TaskDetail> => {
	return apiFetch<TaskDetail>(`/api/tasks/${taskId}`);
};

export const cancelAgentTask = async (
	taskId: string,
): Promise<{
	taskId: string;
	canceled: boolean;
	status: TaskStatus;
	message?: string;
	jobRemoved?: boolean;
	endedAt?: string | null;
}> => {
	return apiFetch(`/api/tasks/${taskId}/cancel`, {
		method: "POST",
	});
};

export type TaskStreamEvent = Record<string, unknown> & {
	type?: string;
};

export const streamAgentTask = (
	taskId: string,
	onEvent: (event: TaskStreamEvent) => void,
	onError?: (error: Error) => void,
): (() => void) => {
	const eventSource = new EventSource(`${SERVER_URL}/api/tasks/${taskId}/stream`, {
		withCredentials: true,
	});

	eventSource.onmessage = (event) => {
		try {
			const parsed = JSON.parse(event.data) as TaskStreamEvent;
			onEvent(parsed);
		} catch {
			// Ignore parse errors
		}
	};

	eventSource.onerror = () => {
		onError?.(new Error("SSE connection error"));
		eventSource.close();
	};

	return () => eventSource.close();
};
