import { env } from "@libra-ai/env/web";

export type DriveStatusResponse = {
	connected: boolean;
	status: "CONNECTED" | "EXPIRED" | "REVOKED" | null;
	googleAccountEmail: string | null;
	lastSyncedAt: string | null;
	filesIndexed: number;
	filesPending: number;
	filesFailed: number;
};

export type DriveFileRow = {
	id: string;
	name: string;
	mimeType: string;
	webViewLink: string | null;
	indexStatus: "PENDING" | "INDEXED" | "FAILED" | "SKIPPED";
	indexError: string | null;
	chunkCount: number;
	lastIndexedAt: string | null;
	modifiedAtGoogle: string | null;
	isDeleted: boolean;
	deletedAt: string | null;
	updatedAt: string;
};

export type DriveFilesResponse = {
	page: number;
	pageSize: number;
	total: number;
	items: DriveFileRow[];
};

const SERVER_URL = env.NEXT_PUBLIC_SERVER_URL;

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
			// Ignore JSON parse errors and keep fallback.
		}
		throw new Error(message);
	}

	if (response.status === 204) {
		return undefined as T;
	}

	return (await response.json()) as T;
};

export const getDriveConnectUrl = (returnTo: string = "/dashboard/drive"): string => {
	return `${SERVER_URL}/api/drive/connect?returnTo=${encodeURIComponent(returnTo)}`;
};

export const getDriveStatus = async (): Promise<DriveStatusResponse> => {
	return apiFetch<DriveStatusResponse>("/api/drive/status", {
		method: "GET",
	});
};

export const syncDrive = async (
	forceFullSync?: boolean,
): Promise<{ jobId: string; queued?: boolean; alreadyQueued?: boolean }> => {
	return apiFetch<{ jobId: string; queued?: boolean; alreadyQueued?: boolean }>(
		"/api/drive/sync",
		{
		method: "POST",
		body: JSON.stringify({ forceFullSync }),
		},
	);
};

export const listDriveFiles = async (params?: {
	page?: number;
	pageSize?: number;
	status?: "PENDING" | "INDEXED" | "FAILED" | "SKIPPED";
	includeDeleted?: boolean;
}): Promise<DriveFilesResponse> => {
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
	if (typeof params?.includeDeleted === "boolean") {
		searchParams.set("includeDeleted", String(params.includeDeleted));
	}

	const query = searchParams.toString();
	const path = query.length > 0 ? `/api/drive/files?${query}` : "/api/drive/files";

	return apiFetch<DriveFilesResponse>(path, {
		method: "GET",
	});
};

export const getDriveFileContentUrl = (fileId: string): string => {
	return `${SERVER_URL}/api/drive/files/${fileId}/content`;
};

export const disconnectDrive = async (): Promise<void> => {
	await apiFetch<void>("/api/drive/disconnect", {
		method: "DELETE",
	});
};
