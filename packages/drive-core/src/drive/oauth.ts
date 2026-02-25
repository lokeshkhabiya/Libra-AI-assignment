import prisma from "@libra-ai/db";
import { env } from "@libra-ai/env/server";

import { google } from "googleapis";

import { ApiError } from "../errors";
import { decryptToken, encryptToken } from "../crypto/token-encryption";
import { DRIVE_PROVIDER, DRIVE_SCOPES } from "./constants";
import {
	createOAuthStatePayload,
	OAuthStateVerificationError,
	signOAuthStatePayload,
	verifyOAuthStatePayload,
} from "./oauth-state";

export type DriveOAuthState = {
	userId: string;
	returnTo: string;
};

const FIVE_MINUTES_MS = 5 * 60 * 1000;

const createOAuthClient = () => {
	return new google.auth.OAuth2(
		env.GOOGLE_CLIENT_ID,
		env.GOOGLE_CLIENT_SECRET,
		env.GOOGLE_DRIVE_REDIRECT_URI,
	);
};

export const createDriveOAuthUrl = (
	userId: string,
	returnTo?: string,
): { url: string; state: string } => {
	const oauthClient = createOAuthClient();
	const payload = createOAuthStatePayload(userId, returnTo);
	const state = signOAuthStatePayload(payload, env.BETTER_AUTH_SECRET);
	const url = oauthClient.generateAuthUrl({
		access_type: "offline",
		include_granted_scopes: true,
		prompt: "consent",
		scope: [...DRIVE_SCOPES],
		state,
	});

	return { url, state };
};

export const verifyDriveOAuthState = (stateToken: string): DriveOAuthState => {
	try {
		return verifyOAuthStatePayload(stateToken, env.BETTER_AUTH_SECRET);
	} catch (error) {
		if (
			error instanceof OAuthStateVerificationError &&
			error.code === "EXPIRED_STATE"
		) {
			throw new ApiError(400, "EXPIRED_STATE", error.message);
		}

		if (error instanceof OAuthStateVerificationError) {
			throw new ApiError(400, "INVALID_STATE", error.message);
		}

		throw error;
	}
};

const toEncrypted = (token: string | null | undefined): string | null => {
	if (!token) {
		return null;
	}

	return encryptToken(token);
};

export const exchangeCodeAndUpsertConnection = async (
	userId: string,
	code: string,
): Promise<{ connectionId: string; googleAccountEmail: string | null }> => {
	const oauthClient = createOAuthClient();
	const { tokens } = await oauthClient.getToken(code);

	if (!tokens.access_token) {
		throw new ApiError(400, "TOKEN_EXCHANGE_FAILED", "Google did not return access token");
	}

	oauthClient.setCredentials(tokens);
	const oauth2 = google.oauth2({ version: "v2", auth: oauthClient });
	const profile = await oauth2.userinfo.get();

	const existing = await prisma.driveConnection.findUnique({
		where: {
			userId_provider: {
				userId,
				provider: DRIVE_PROVIDER,
			},
		},
	});

	const refreshTokenEncrypted =
		toEncrypted(tokens.refresh_token) ?? existing?.refreshTokenEncrypted ?? null;

	const connection = await prisma.driveConnection.upsert({
		where: {
			userId_provider: {
				userId,
				provider: DRIVE_PROVIDER,
			},
		},
		create: {
			userId,
			provider: DRIVE_PROVIDER,
			status: "CONNECTED",
			googleAccountEmail: profile.data.email ?? null,
			accessTokenEncrypted: toEncrypted(tokens.access_token),
			refreshTokenEncrypted,
			tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
			syncCursor: null,
		},
		update: {
			status: "CONNECTED",
			googleAccountEmail: profile.data.email ?? null,
			accessTokenEncrypted: toEncrypted(tokens.access_token),
			refreshTokenEncrypted,
			tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
		},
	});

	return {
		connectionId: connection.id,
		googleAccountEmail: connection.googleAccountEmail,
	};
};

const persistRefreshedCredentials = async (
	connectionId: string,
	credentials: {
		access_token?: string | null;
		refresh_token?: string | null;
		expiry_date?: number | null;
	},
) => {
	const existing = await prisma.driveConnection.findUnique({
		where: { id: connectionId },
	});

	if (!existing) {
		throw new ApiError(404, "CONNECTION_NOT_FOUND", "Drive connection no longer exists");
	}

	await prisma.driveConnection.update({
		where: { id: connectionId },
		data: {
			status: "CONNECTED",
			accessTokenEncrypted:
				credentials.access_token && credentials.access_token.length > 0
					? encryptToken(credentials.access_token)
					: existing.accessTokenEncrypted,
			refreshTokenEncrypted:
				credentials.refresh_token && credentials.refresh_token.length > 0
					? encryptToken(credentials.refresh_token)
					: existing.refreshTokenEncrypted,
			tokenExpiresAt:
				typeof credentials.expiry_date === "number"
					? new Date(credentials.expiry_date)
					: existing.tokenExpiresAt,
		},
	});
};

export const getAuthorizedDriveClient = async (params: {
	userId: string;
	connectionId: string;
}): Promise<{
	drive: any;
	oauthClient: any;
	connection: any;
}> => {
	const connection = await prisma.driveConnection.findFirst({
		where: {
			id: params.connectionId,
			userId: params.userId,
			provider: DRIVE_PROVIDER,
		},
	});

	if (!connection) {
		throw new ApiError(404, "CONNECTION_NOT_FOUND", "Drive connection not found");
	}

	if (connection.status === "REVOKED") {
		throw new ApiError(400, "CONNECTION_REVOKED", "Drive connection has been revoked");
	}

	if (!connection.refreshTokenEncrypted && !connection.accessTokenEncrypted) {
		throw new ApiError(400, "MISSING_TOKENS", "Drive tokens are missing");
	}

	const oauthClient = createOAuthClient();
	oauthClient.setCredentials({
		access_token: connection.accessTokenEncrypted
			? decryptToken(connection.accessTokenEncrypted)
			: undefined,
		refresh_token: connection.refreshTokenEncrypted
			? decryptToken(connection.refreshTokenEncrypted)
			: undefined,
		expiry_date: connection.tokenExpiresAt?.getTime(),
	});

	const shouldRefresh =
		!connection.tokenExpiresAt ||
		connection.tokenExpiresAt.getTime() <= Date.now() + FIVE_MINUTES_MS;

	if (shouldRefresh && connection.refreshTokenEncrypted) {
		const refreshed = await oauthClient.refreshAccessToken();
		const credentials = refreshed.credentials;

		await persistRefreshedCredentials(connection.id, {
			access_token: credentials.access_token,
			refresh_token: credentials.refresh_token,
			expiry_date: credentials.expiry_date,
		});
	}

	const drive = google.drive({
		version: "v3",
		auth: oauthClient,
	});

	return {
		drive,
		oauthClient,
		connection,
	};
};

export const revokeConnectionTokens = async (
	userId: string,
	connectionId: string,
): Promise<void> => {
	const connection = await prisma.driveConnection.findFirst({
		where: { id: connectionId, userId },
	});

	if (!connection) {
		return;
	}

	const oauthClient = createOAuthClient();
	const accessToken = connection.accessTokenEncrypted
		? decryptToken(connection.accessTokenEncrypted)
		: null;
	const refreshToken = connection.refreshTokenEncrypted
		? decryptToken(connection.refreshTokenEncrypted)
		: null;

	try {
		if (accessToken) {
			await oauthClient.revokeToken(accessToken);
		}
		if (refreshToken) {
			await oauthClient.revokeToken(refreshToken);
		}
	} catch {
		// Connection can still be locally revoked even when remote revoke fails.
	}
};
