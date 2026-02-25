import prisma from "@libra-ai/db";
import { env } from "@libra-ai/env/server";
import { driveSyncQueue } from "@libra-ai/queue";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { type AuthenticatedRequest } from "@/middleware/auth";
import { ApiError } from "@/middleware/error";
import {
	createDriveOAuthUrl,
	deleteUserNamespace,
	exchangeCodeAndUpsertConnection,
	FULL_SYNC_JOB_NAME,
	revokeConnectionTokens,
	sanitizeDbText,
	verifyDriveOAuthState,
} from "@libra-ai/drive-core";

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

const toClientRedirectUrl = (path: string, params?: Record<string, string>): string => {
	const url = new URL(path, env.CORS_ORIGIN);
	if (params) {
		for (const [key, value] of Object.entries(params)) {
			url.searchParams.set(key, value);
		}
	}

	return url.toString();
};

const ensureAuth = (req: Request): AuthenticatedRequest => {
	const typed = req as AuthenticatedRequest;
	if (!typed.auth?.user?.id) {
		throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
	}
	return typed;
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

		await driveSyncQueue.add(
			FULL_SYNC_JOB_NAME,
			{
				driveConnectionId: connectionId,
				userId: authReq.auth.user.id,
				forceFullSync: true,
			},
			{
				jobId: `sync-${connectionId}`,
				attempts: 3,
				backoff: {
					type: "exponential",
					delay: 1500,
				},
			},
		);

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

		res.json({
			connected: connection.status === "CONNECTED",
			status: connection.status,
			googleAccountEmail: connection.googleAccountEmail,
			lastSyncedAt: connection.lastSyncedAt,
			filesIndexed,
			filesPending,
			filesFailed,
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

		const job = await driveSyncQueue.add(
			FULL_SYNC_JOB_NAME,
			{
				driveConnectionId: connection.id,
				userId: authReq.auth.user.id,
				forceFullSync: body.data.forceFullSync,
			},
			{
				jobId: `sync-${connection.id}`,
				attempts: 3,
				backoff: {
					type: "exponential",
					delay: 1500,
				},
			},
		);

		res.status(202).json({
			queued: true,
			jobId: job.id,
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
