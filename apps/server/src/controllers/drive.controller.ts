import prisma from "@libra-ai/db";
import { env } from "@libra-ai/env/server";
import {
	driveIngestQueue,
	enqueueDriveSyncJob,
	findQueuedDriveSyncJob,
} from "@libra-ai/queue";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { type AuthenticatedRequest } from "@/middleware/auth";
import { ApiError } from "@/middleware/error";
import {
	createDriveOAuthUrl,
	deleteUserNamespace,
	exchangeCodeAndUpsertConnection,
	getAuthorizedDriveClient,
	INGEST_JOB_NAME,
	revokeConnectionTokens,
	sanitizeDbText,
	SUPPORTED_MIME_TYPES,
	verifyDriveOAuthState,
} from "@libra-ai/drive-core";
import {
	buildDriveFileContentHash,
	normalizePickerGoogleFileIds,
	shouldQueuePickerIngest,
} from "@/controllers/drive-picker-utils";

const syncPayloadSchema = z.object({
	forceFullSync: z.boolean().optional(),
});

const filesQuerySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	pageSize: z.coerce.number().int().min(1).max(100).default(20),
	status: z.enum(["PENDING", "INDEXED", "FAILED", "SKIPPED"]).optional(),
	includeDeleted: z
		.union([z.literal("true"), z.literal("false")])
		.optional()
		.transform((value) => value === "true"),
});

const driveFileParamsSchema = z.object({
	fileId: z.string().min(1),
});

const pickerSelectPayloadSchema = z.object({
	googleFileIds: z.array(z.string().min(1)).min(1).max(20),
});

const pickerTokenResponseSchema = z.object({
	accessToken: z.string().min(1),
});

const toClientRedirectUrl = (path: string, params?: Record<string, string>): string => {
	const url = new URL(path, env.CORS_ORIGIN);
	if (params) {
		for (const [key, value] of Object.entries(params)) {
			url.searchParams.set(key, value);
		}
	}

	return url.toString();
};

const DEFAULT_AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;

const getAutoSyncIntervalMs = (): number => {
	const rawValue = process.env.DRIVE_AUTO_SYNC_INTERVAL_MS;
	if (!rawValue) {
		return DEFAULT_AUTO_SYNC_INTERVAL_MS;
	}

	const parsed = Number.parseInt(rawValue, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return DEFAULT_AUTO_SYNC_INTERVAL_MS;
	}

	return parsed;
};

const ensureAuth = (req: Request): AuthenticatedRequest => {
	const typed = req as AuthenticatedRequest;
	if (!typed.auth?.user?.id) {
		throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
	}
	return typed;
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

const enqueueIngestJob = async (params: {
	driveFileId: string;
	userId: string;
	forceReingest: boolean;
}) => {
	await driveIngestQueue.add(
		INGEST_JOB_NAME,
		{
			driveFileId: params.driveFileId,
			userId: params.userId,
			forceReingest: params.forceReingest,
		},
		{
			attempts: 3,
			backoff: {
				type: "exponential",
				delay: 1500,
			},
		},
	);
};

export const connectDriveController = async (
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> => {
	try {
		const authReq = req as AuthenticatedRequest;
		const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : "/dashboard/drive";

		const { url } = createDriveOAuthUrl(authReq.auth.user.id, returnTo);
		if (req.query.redirect === "false") {
			res.json({ url });
			return;
		}

		res.redirect(url);
	} catch (error) {
		next(error);
	}
};

export const callbackDriveController = async (
	req: Request,
	res: Response,
): Promise<void> => {
	const code = typeof req.query.code === "string" ? req.query.code : null;
	const state = typeof req.query.state === "string" ? req.query.state : null;

	if (!code || !state) {
		res.redirect(
			toClientRedirectUrl("/dashboard/drive", {
				error: "missing_oauth_code",
			}),
		);
		return;
	}

	try {
		const authReq = ensureAuth(req);
		const parsedState = verifyDriveOAuthState(state);

		if (parsedState.userId !== authReq.auth.user.id) {
			throw new ApiError(
				403,
				"STATE_USER_MISMATCH",
				"OAuth state does not match the authenticated user",
			);
		}

		const { connectionId } = await exchangeCodeAndUpsertConnection(
			authReq.auth.user.id,
			code,
		);

		await enqueueDriveSyncJob({
			driveConnectionId: connectionId,
			userId: authReq.auth.user.id,
			forceFullSync: true,
		});

		const redirectUrl = toClientRedirectUrl(parsedState.returnTo, {
			connected: "1",
		});
		res.redirect(redirectUrl);
	} catch (error) {
		res.redirect(
			toClientRedirectUrl("/dashboard/drive", {
				error:
					error instanceof ApiError
						? sanitizeDbText(error.message)
						: "oauth_failed",
			}),
		);
	}
};

export const driveStatusController = async (
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> => {
	try {
		const authReq = ensureAuth(req);
		const userId = authReq.auth.user.id;

		const connection = await prisma.driveConnection.findUnique({
			where: {
				userId_provider: {
					userId,
					provider: "GOOGLE_DRIVE",
				},
			},
		});

		if (!connection) {
			res.json({
				connected: false,
				status: null,
				googleAccountEmail: null,
				lastSyncedAt: null,
				filesIndexed: 0,
				filesPending: 0,
				filesFailed: 0,
				syncJobQueued: false,
				autoSyncEnabled: true,
				autoSyncIntervalMs: getAutoSyncIntervalMs(),
			});
			return;
		}

		const statusCounts = await prisma.driveFile.groupBy({
			by: ["indexStatus"],
			where: { userId, isDeleted: false },
			_count: { _all: true },
		});

		const countByStatus = Object.fromEntries(
			statusCounts.map((row) => [row.indexStatus, row._count._all]),
		);
		const filesIndexed = countByStatus["INDEXED"] ?? 0;
		const filesPending = countByStatus["PENDING"] ?? 0;
		const filesFailed = countByStatus["FAILED"] ?? 0;
		const queuedSyncJob = await findQueuedDriveSyncJob(connection.id);

		res.json({
			connected: connection.status === "CONNECTED",
			status: connection.status,
			googleAccountEmail: connection.googleAccountEmail,
			lastSyncedAt: connection.lastSyncedAt,
			filesIndexed,
			filesPending,
			filesFailed,
			syncJobQueued: Boolean(queuedSyncJob),
			autoSyncEnabled: true,
			autoSyncIntervalMs: getAutoSyncIntervalMs(),
		});
	} catch (error) {
		next(error);
	}
};

export const syncDriveController = async (
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> => {
	try {
		const authReq = ensureAuth(req);
		const body = syncPayloadSchema.safeParse(req.body ?? {});
		if (!body.success) {
			throw new ApiError(400, "INVALID_PAYLOAD", body.error.message);
		}

		const connection = await prisma.driveConnection.findUnique({
			where: {
				userId_provider: {
					userId: authReq.auth.user.id,
					provider: "GOOGLE_DRIVE",
				},
			},
		});

		if (!connection || connection.status !== "CONNECTED") {
			throw new ApiError(400, "NO_ACTIVE_CONNECTION", "Google Drive is not connected");
		}

		const queueResult = await enqueueDriveSyncJob({
			driveConnectionId: connection.id,
			userId: authReq.auth.user.id,
			forceFullSync: body.data.forceFullSync ?? false,
		});

		res.status(202).json({
			queued: !queueResult.alreadyQueued,
			alreadyQueued: queueResult.alreadyQueued,
			jobId: queueResult.jobId,
		});
	} catch (error) {
		next(error);
	}
};

export const drivePickerTokenController = async (
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> => {
	try {
		const authReq = ensureAuth(req);
		const connection = await prisma.driveConnection.findUnique({
			where: {
				userId_provider: {
					userId: authReq.auth.user.id,
					provider: "GOOGLE_DRIVE",
				},
			},
		});

		if (!connection || connection.status !== "CONNECTED") {
			throw new ApiError(400, "NO_ACTIVE_CONNECTION", "Google Drive is not connected");
		}

		const { oauthClient } = await getAuthorizedDriveClient({
			userId: authReq.auth.user.id,
			connectionId: connection.id,
		});
		const accessToken = oauthClient?.credentials?.access_token as string | undefined;

		const payload = pickerTokenResponseSchema.safeParse({
			accessToken,
		});
		if (!payload.success) {
			throw new ApiError(500, "MISSING_ACCESS_TOKEN", "Unable to create picker token");
		}

		res.json(payload.data);
	} catch (error) {
		next(error);
	}
};

export const drivePickerSelectController = async (
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> => {
	try {
		const authReq = ensureAuth(req);
		const body = pickerSelectPayloadSchema.safeParse(req.body ?? {});
		if (!body.success) {
			throw new ApiError(400, "INVALID_PAYLOAD", body.error.message);
		}

		const connection = await prisma.driveConnection.findUnique({
			where: {
				userId_provider: {
					userId: authReq.auth.user.id,
					provider: "GOOGLE_DRIVE",
				},
			},
		});
		if (!connection || connection.status !== "CONNECTED") {
			throw new ApiError(400, "NO_ACTIVE_CONNECTION", "Google Drive is not connected");
		}

		const { drive } = await getAuthorizedDriveClient({
			userId: authReq.auth.user.id,
			connectionId: connection.id,
		});

		const dedupedGoogleFileIds = normalizePickerGoogleFileIds(
			body.data.googleFileIds.map((id) => sanitizeDbText(id)),
		);

		const attachedFiles: Array<{
			driveFileId: string;
			googleFileId: string;
			name: string;
			mimeType: string;
			indexStatus: "PENDING" | "INDEXED" | "FAILED" | "SKIPPED";
			alreadyIndexed: boolean;
		}> = [];
		const rejectedFiles: Array<{ googleFileId: string; reason: string }> = [];
		let queuedCount = 0;

		for (const googleFileId of dedupedGoogleFileIds) {
			const fileResponse = await drive.files.get({
				fileId: googleFileId,
				supportsAllDrives: true,
				fields: "id,name,mimeType,modifiedTime,md5Checksum,webViewLink,trashed",
			});
			const file = fileResponse.data;
			if (!file.id || !file.name || !file.mimeType || file.trashed) {
				rejectedFiles.push({ googleFileId, reason: "File is unavailable or trashed" });
				continue;
			}
			if (!SUPPORTED_MIME_TYPES.has(file.mimeType)) {
				rejectedFiles.push({
					googleFileId,
					reason: `Unsupported mime type: ${file.mimeType}`,
				});
				continue;
			}

			const existing = await prisma.driveFile.findUnique({
				where: {
					userId_googleFileId: {
						userId: authReq.auth.user.id,
						googleFileId: file.id,
					},
				},
				select: {
					id: true,
					contentHash: true,
					isDeleted: true,
					indexStatus: true,
				},
			});

			const contentHash = buildDriveFileContentHash({
				id: file.id,
				modifiedTime: file.modifiedTime ?? null,
				md5Checksum: file.md5Checksum ?? null,
			});
			const hasChanged = shouldQueuePickerIngest({
				existing,
				contentHash,
			});
			const nextIndexStatus: "PENDING" | "INDEXED" | "FAILED" | "SKIPPED" = hasChanged
				? "PENDING"
				: (existing?.indexStatus ?? "PENDING");

			const driveFile = await prisma.driveFile.upsert({
				where: {
					userId_googleFileId: {
						userId: authReq.auth.user.id,
						googleFileId: file.id,
					},
				},
				create: {
					userId: authReq.auth.user.id,
					connectionId: connection.id,
					googleFileId: file.id,
					name: sanitizeDbText(file.name),
					mimeType: file.mimeType,
					webViewLink: file.webViewLink ? sanitizeDbText(file.webViewLink) : null,
					contentHash,
					modifiedAtGoogle: toDate(file.modifiedTime),
					isDeleted: false,
					deletedAt: null,
					deletedAtGoogle: null,
					indexStatus: nextIndexStatus,
				},
				update: {
					name: sanitizeDbText(file.name),
					mimeType: file.mimeType,
					webViewLink: file.webViewLink ? sanitizeDbText(file.webViewLink) : null,
					contentHash,
					modifiedAtGoogle: toDate(file.modifiedTime),
					isDeleted: false,
					deletedAt: null,
					deletedAtGoogle: null,
					indexStatus: nextIndexStatus,
					indexError: hasChanged ? null : undefined,
				},
			});

			if (hasChanged) {
				await enqueueIngestJob({
					driveFileId: driveFile.id,
					userId: authReq.auth.user.id,
					forceReingest: Boolean(existing),
				});
				queuedCount += 1;
			}

			attachedFiles.push({
				driveFileId: driveFile.id,
				googleFileId: file.id,
				name: driveFile.name,
				mimeType: driveFile.mimeType,
				indexStatus: driveFile.indexStatus,
				alreadyIndexed: !hasChanged && driveFile.indexStatus === "INDEXED",
			});
		}

		res.status(202).json({
			attachedFiles,
			rejectedFiles,
			queuedCount,
		});
	} catch (error) {
		next(error);
	}
};

export const listDriveFilesController = async (
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> => {
	try {
		const authReq = ensureAuth(req);
		const queryResult = filesQuerySchema.safeParse(req.query ?? {});
		if (!queryResult.success) {
			throw new ApiError(400, "INVALID_QUERY", queryResult.error.message);
		}

		const { page, pageSize, status, includeDeleted } = queryResult.data;
		const where = {
			userId: authReq.auth.user.id,
			isDeleted: includeDeleted ? undefined : false,
			indexStatus: status,
		};

		const [items, total] = await Promise.all([
			prisma.driveFile.findMany({
				where,
				orderBy: {
					updatedAt: "desc",
				},
				skip: (page - 1) * pageSize,
				take: pageSize,
				select: {
					id: true,
					name: true,
					mimeType: true,
					webViewLink: true,
					indexStatus: true,
					indexError: true,
					chunkCount: true,
					lastIndexedAt: true,
					modifiedAtGoogle: true,
					isDeleted: true,
					deletedAt: true,
					updatedAt: true,
				},
			}),
			prisma.driveFile.count({ where }),
		]);

		res.json({
			page,
			pageSize,
			total,
			items,
		});
	} catch (error) {
		next(error);
	}
};

export const getDriveFileContentController = async (
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> => {
	try {
		const authReq = ensureAuth(req);
		const parsedParams = driveFileParamsSchema.safeParse(req.params ?? {});
		if (!parsedParams.success) {
			throw new ApiError(400, "INVALID_FILE_ID", parsedParams.error.message);
		}
		const fileId = parsedParams.data.fileId;

		const file = await prisma.driveFile.findFirst({
			where: {
				id: fileId,
				userId: authReq.auth.user.id,
				isDeleted: false,
			},
			include: {
				connection: true,
			},
		});

		if (!file) {
			throw new ApiError(404, "FILE_NOT_FOUND", "File not found");
		}

		const { drive } = await getAuthorizedDriveClient({
			userId: authReq.auth.user.id,
			connectionId: file.connectionId,
		});

		const isGoogleDoc = file.mimeType === "application/vnd.google-apps.document";
		const isPdf = file.mimeType === "application/pdf";

		if (isGoogleDoc) {
			const exported = await drive.files.export(
				{ fileId: file.googleFileId, mimeType: "text/plain" },
				{ responseType: "text" },
			);
			res.setHeader("Content-Type", "text/plain; charset=utf-8");
			res.send(exported.data);
		} else if (isPdf) {
			const downloaded = await drive.files.get(
				{ fileId: file.googleFileId, alt: "media" },
				{ responseType: "arraybuffer" },
			);
			res.setHeader("Content-Type", "application/pdf");
			res.setHeader("Content-Disposition", `inline; filename="${file.name}"`);
			res.send(Buffer.from(downloaded.data as ArrayBuffer));
		} else {
			const downloaded = await drive.files.get(
				{ fileId: file.googleFileId, alt: "media" },
				{ responseType: "text" },
			);
			res.setHeader("Content-Type", file.mimeType || "text/plain");
			res.send(downloaded.data);
		}
	} catch (error) {
		next(error);
	}
};

export const disconnectDriveController = async (
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> => {
	try {
		const authReq = ensureAuth(req);
		const userId = authReq.auth.user.id;

		const connection = await prisma.driveConnection.findUnique({
			where: {
				userId_provider: {
					userId,
					provider: "GOOGLE_DRIVE",
				},
			},
		});

		if (!connection) {
			res.status(204).send();
			return;
		}

		await revokeConnectionTokens(userId, connection.id);
		await deleteUserNamespace(userId);

		await prisma.$transaction([
			prisma.driveChunk.deleteMany({
				where: { userId },
			}),
			prisma.driveFile.updateMany({
				where: { userId },
				data: {
					isDeleted: true,
					deletedAt: new Date(),
					indexStatus: "SKIPPED",
					chunkCount: 0,
				},
			}),
			prisma.driveConnection.update({
				where: { id: connection.id },
				data: {
					status: "REVOKED",
					accessTokenEncrypted: null,
					refreshTokenEncrypted: null,
					tokenExpiresAt: null,
					syncCursor: null,
				},
			}),
		]);

		res.status(204).send();
	} catch (error) {
		next(error);
	}
};
