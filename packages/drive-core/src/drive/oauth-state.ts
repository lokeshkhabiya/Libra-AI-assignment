import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type OAuthStatePayload = {
	userId: string;
	nonce: string;
	exp: number;
	returnTo: string;
};

export type VerifiedOAuthState = {
	userId: string;
	returnTo: string;
};

export class OAuthStateVerificationError extends Error {
	readonly code:
		| "MALFORMED_STATE"
		| "SIGNATURE_MISMATCH"
		| "INVALID_PAYLOAD"
		| "EXPIRED_STATE";

	constructor(
		code:
			| "MALFORMED_STATE"
			| "SIGNATURE_MISMATCH"
			| "INVALID_PAYLOAD"
			| "EXPIRED_STATE",
		message: string,
	) {
		super(message);
		this.code = code;
	}
}

export const normalizeDriveReturnTo = (returnTo?: string): string => {
	if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) {
		return "/dashboard/drive";
	}

	return returnTo;
};

export const createOAuthStatePayload = (
	userId: string,
	returnTo?: string,
	nowMs: number = Date.now(),
	ttlMs: number = 10 * 60 * 1000,
): OAuthStatePayload => {
	return {
		userId,
		nonce: randomBytes(16).toString("hex"),
		exp: nowMs + ttlMs,
		returnTo: normalizeDriveReturnTo(returnTo),
	};
};

export const signOAuthStatePayload = (
	payload: OAuthStatePayload,
	secret: string,
): string => {
	const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
	const signature = createHmac("sha256", secret).update(encodedPayload).digest();
	return `${encodedPayload}.${signature.toString("base64url")}`;
};

export const verifyOAuthStatePayload = (
	stateToken: string,
	secret: string,
	nowMs: number = Date.now(),
): VerifiedOAuthState => {
	const [payloadToken, signatureToken] = stateToken.split(".");

	if (!payloadToken || !signatureToken) {
		throw new OAuthStateVerificationError(
			"MALFORMED_STATE",
			"Missing OAuth state payload",
		);
	}

	const expectedSignature = createHmac("sha256", secret).update(payloadToken).digest();
	const receivedSignature = Buffer.from(signatureToken, "base64url");

	if (
		expectedSignature.length !== receivedSignature.length ||
		!timingSafeEqual(expectedSignature, receivedSignature)
	) {
		throw new OAuthStateVerificationError(
			"SIGNATURE_MISMATCH",
			"OAuth state signature mismatch",
		);
	}

	const payload = JSON.parse(Buffer.from(payloadToken, "base64url").toString("utf8")) as
		| OAuthStatePayload
		| undefined;

	if (!payload || !payload.userId || !payload.returnTo || !payload.exp) {
		throw new OAuthStateVerificationError(
			"INVALID_PAYLOAD",
			"Malformed OAuth state payload",
		);
	}

	if (payload.exp < nowMs) {
		throw new OAuthStateVerificationError("EXPIRED_STATE", "OAuth state has expired");
	}

	return {
		userId: payload.userId,
		returnTo: normalizeDriveReturnTo(payload.returnTo),
	};
};
