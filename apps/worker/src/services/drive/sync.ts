import prisma from "@libra-ai/db";
import { driveIngestQueue } from "@libra-ai/queue";
import {
	ApiError,
	deleteFileRecords,
	getAuthorizedDriveClient,
	FULL_SYNC_JOB_NAME,
	INGEST_JOB_NAME,
	MAX_DRIVE_FILE_PAGE_SIZE,
	sanitizeDbText,
	SUPPORTED_MIME_TYPES,
} from "@libra-ai/drive-core";

import { shouldReingestSnapshot, resolveSnapshotIndexStatus } from "./sync-decision";

export type DriveSyncParams = {
	driveConnectionId: string;
	userId: string;
	forceFullSync?: boolean;
};

type DriveFileSnapshot = {
	googleFileId: string;
	name: string;
	mimeType: string;
	webViewLink: string | null;
	modifiedAtGoogle: Date | null;
	contentHash: string;
};

type ExistingDriveFileState = {
	contentHash: string | null;
	isDeleted: boolean;
	indexStatus: "PENDING" | "INDEXED" | "FAILED" | "SKIPPED";
};

const toDate = (value: string | null | undefined): Date | null => {
	if (!value) {
		return null;
	}

	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return null;
	}

	return parsed;
};

const buildContentHash = (file: {
	id: string;
	modifiedTime?: string | null;
	md5Checksum?: string | null;
}): string => {
	if (file.md5Checksum) {
		return file.md5Checksum;
	}

	if (file.modifiedTime) {
		return `${file.id}:${file.modifiedTime}`;
	}

	return `${file.id}:nohash`;
};

const isSupportedFile = (file: {
	mimeType?: string | null;
	trashed?: boolean | null;
}): boolean => {
	if (file.trashed) {
		return false;
	}

	if (!file.mimeType) {
		return false;
	}

	return SUPPORTED_MIME_TYPES.has(file.mimeType);
};

const mapGoogleFile = (file: {
	id?: string | null;
	name?: string | null;
	mimeType?: string | null;
	modifiedTime?: string | null;
	md5Checksum?: string | null;
	webViewLink?: string | null;
	trashed?: boolean | null;
}): DriveFileSnapshot | null => {
	if (!file.id || !file.name || !file.mimeType || !isSupportedFile(file)) {
		return null;
	}

	return {
		googleFileId: file.id,
		name: sanitizeDbText(file.name),
		mimeType: file.mimeType,
		webViewLink: file.webViewLink ? sanitizeDbText(file.webViewLink) : null,
		modifiedAtGoogle: toDate(file.modifiedTime),
		contentHash: buildContentHash({
			id: file.id,
			modifiedTime: file.modifiedTime,
			md5Checksum: file.md5Checksum,
		}),
	};
};

const enqueueIngestJob = async (params: {
	driveFileId: string;
	userId: string;
	forceReingest: boolean;
}) => {
	await driveIngestQueue.add(INGEST_JOB_NAME, {
		driveFileId: params.driveFileId,
		userId: params.userId,
		forceReingest: params.forceReingest,
	}, {
		attempts: 3,
		backoff: {
			type: "exponential",
			delay: 1500,
		},
	});
};

const markDeleted = async (params: {
	userId: string;
	driveFileId: string;
	deletedAtGoogle?: Date | null;
}) => {
	await deleteFileRecords(params.userId, params.driveFileId);

	await prisma.$transaction([
		prisma.driveChunk.deleteMany({
			where: { driveFileId: params.driveFileId },
		}),
		prisma.driveFile.update({
			where: { id: params.driveFileId },
			data: {
				isDeleted: true,
				deletedAt: new Date(),
				deletedAtGoogle: params.deletedAtGoogle ?? null,
				indexStatus: "SKIPPED",
				chunkCount: 0,
			},
		}),
	]);
};

const listAllSupportedFiles = async (drive: any): Promise<DriveFileSnapshot[]> => {
	const files: DriveFileSnapshot[] = [];
	let pageToken: string | undefined;

	while (true) {
		const response = await drive.files.list({
			includeItemsFromAllDrives: true,
			supportsAllDrives: true,
			q: "trashed = false",
			fields:
				"nextPageToken, files(id,name,mimeType,modifiedTime,md5Checksum,webViewLink,trashed)",
			pageSize: MAX_DRIVE_FILE_PAGE_SIZE,
			pageToken,
		});

		const pageFiles = response.data.files ?? [];
		for (const pageFile of pageFiles) {
			const mapped = mapGoogleFile(pageFile);
			if (mapped) {
				files.push(mapped);
			}
		}

		pageToken = response.data.nextPageToken ?? undefined;
		if (!pageToken) {
			break;
		}
	}

	return files;
};

const syncSingleFile = async (params: {
	connectionId: string;
	userId: string;
	snapshot: DriveFileSnapshot;
	existing?: ExistingDriveFileState & { id: string };
	forceReingest: boolean;
}) => {
	const hasChanged = shouldReingestSnapshot({
		forceReingest: params.forceReingest,
		snapshotContentHash: params.snapshot.contentHash,
		existing: params.existing,
	});

	const indexStatus = resolveSnapshotIndexStatus({
		hasChanged,
		existing: params.existing,
	});

	const driveFile = await prisma.driveFile.upsert({
		where: {
			userId_googleFileId: {
				userId: params.userId,
				googleFileId: params.snapshot.googleFileId,
			},
		},
		create: {
			userId: params.userId,
			connectionId: params.connectionId,
			googleFileId: params.snapshot.googleFileId,
			name: params.snapshot.name,
			mimeType: params.snapshot.mimeType,
			webViewLink: params.snapshot.webViewLink,
			contentHash: params.snapshot.contentHash,
			modifiedAtGoogle: params.snapshot.modifiedAtGoogle,
			isDeleted: false,
			deletedAt: null,
			deletedAtGoogle: null,
			indexStatus,
		},
		update: {
			name: params.snapshot.name,
			mimeType: params.snapshot.mimeType,
			webViewLink: params.snapshot.webViewLink,
			contentHash: params.snapshot.contentHash,
			modifiedAtGoogle: params.snapshot.modifiedAtGoogle,
			isDeleted: false,
			deletedAt: null,
			deletedAtGoogle: null,
			indexStatus,
			indexError: hasChanged ? null : undefined,
		},
	});

	if (hasChanged) {
		await enqueueIngestJob({
			driveFileId: driveFile.id,
			userId: params.userId,
			// Only force re-ingest cleanup when the file already existed.
			forceReingest: Boolean(params.existing),
		});
	}
};

const runFullSync = async (params: {
	drive: any;
	userId: string;
	driveConnectionId: string;
}) => {
	const existingFiles = await prisma.driveFile.findMany({
		where: {
			userId: params.userId,
			connectionId: params.driveConnectionId,
		},
		select: {
			id: true,
			googleFileId: true,
			contentHash: true,
			isDeleted: true,
			indexStatus: true,
		},
	});

	const existingByGoogleId = new Map(
		existingFiles.map((file) => [file.googleFileId, file]),
	);

	const seenGoogleFileIds = new Set<string>();
	const snapshots = await listAllSupportedFiles(params.drive);

	for (const snapshot of snapshots) {
		seenGoogleFileIds.add(snapshot.googleFileId);
		const existing = existingByGoogleId.get(snapshot.googleFileId);

		await syncSingleFile({
			connectionId: params.driveConnectionId,
			userId: params.userId,
			snapshot,
			existing,
			forceReingest: false,
		});
	}

	for (const existing of existingFiles) {
		if (seenGoogleFileIds.has(existing.googleFileId) || existing.isDeleted) {
			continue;
		}

		await markDeleted({
			userId: params.userId,
			driveFileId: existing.id,
		});
	}

	const startPageToken = await params.drive.changes.getStartPageToken({
		supportsAllDrives: true,
	});

	await prisma.driveConnection.update({
		where: { id: params.driveConnectionId },
		data: {
			syncCursor: startPageToken.data.startPageToken ?? null,
			lastSyncedAt: new Date(),
			status: "CONNECTED",
		},
	});
};

const runIncrementalSync = async (params: {
	drive: any;
	userId: string;
	driveConnectionId: string;
	syncCursor: string;
}) => {
	const existingFiles = await prisma.driveFile.findMany({
		where: {
			userId: params.userId,
			connectionId: params.driveConnectionId,
		},
		select: {
			id: true,
			googleFileId: true,
			contentHash: true,
			isDeleted: true,
			indexStatus: true,
		},
	});
	const existingByGoogleId = new Map(
		existingFiles.map((file) => [file.googleFileId, file]),
	);

	let pageToken: string | undefined = params.syncCursor;
	let newStartPageToken: string | null = null;

	while (pageToken) {
		const response: any = await params.drive.changes.list({
			pageToken,
			pageSize: MAX_DRIVE_FILE_PAGE_SIZE,
			supportsAllDrives: true,
			includeItemsFromAllDrives: true,
			fields:
				"nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,modifiedTime,md5Checksum,webViewLink,trashed))",
		});

		const changes = response.data.changes ?? [];

		for (const change of changes) {
			const googleFileId = change.fileId;
			if (!googleFileId) {
				continue;
			}

			const existing = existingByGoogleId.get(googleFileId);
			const removed = change.removed || change.file?.trashed;

			if (removed) {
				if (existing) {
					await markDeleted({
						userId: params.userId,
						driveFileId: existing.id,
						deletedAtGoogle: toDate(change.file?.modifiedTime),
					});
				}
				continue;
			}

			if (!change.file) {
				continue;
			}

			const snapshot = mapGoogleFile(change.file);
			if (!snapshot) {
				if (existing && !existing.isDeleted) {
					await markDeleted({
						userId: params.userId,
						driveFileId: existing.id,
						deletedAtGoogle: toDate(change.file.modifiedTime),
					});
				}
				continue;
			}

			await syncSingleFile({
				connectionId: params.driveConnectionId,
				userId: params.userId,
				snapshot,
				existing,
				forceReingest: false,
			});
		}

		pageToken = response.data.nextPageToken ?? undefined;
		if (response.data.newStartPageToken) {
			newStartPageToken = response.data.newStartPageToken;
		}
	}

	await prisma.driveConnection.update({
		where: { id: params.driveConnectionId },
		data: {
			syncCursor: newStartPageToken ?? params.syncCursor,
			lastSyncedAt: new Date(),
			status: "CONNECTED",
		},
	});
};

export const runDriveSync = async ({
	driveConnectionId,
	userId,
	forceFullSync = false,
}: DriveSyncParams): Promise<void> => {
	const { drive, connection } = await getAuthorizedDriveClient({
		connectionId: driveConnectionId,
		userId,
	});

	if (connection.status === "REVOKED") {
		throw new ApiError(400, "CONNECTION_REVOKED", "Drive connection has been revoked");
	}

	const shouldRunFullSync = forceFullSync || !connection.syncCursor;

	if (shouldRunFullSync) {
		await runFullSync({
			drive,
			userId,
			driveConnectionId,
		});
		return;
	}

	const incrementalCursor = connection.syncCursor;
	if (!incrementalCursor) {
		await runFullSync({
			drive,
			userId,
			driveConnectionId,
		});
		return;
	}

	try {
		await runIncrementalSync({
			drive,
			userId,
			driveConnectionId,
			syncCursor: incrementalCursor,
		});
	} catch (error) {
		const maybeCode = (error as { code?: number } | undefined)?.code;
		if (maybeCode === 410) {
			await runFullSync({
				drive,
				userId,
				driveConnectionId,
			});
			return;
		}

		throw error;
	}
};

export const queueMetadata = {
	jobName: FULL_SYNC_JOB_NAME,
};
