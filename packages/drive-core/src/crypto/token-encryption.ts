import { env } from "@libra-ai/env/server";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const AES_ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

let encryptionKeyCache: Buffer | null = null;

export const parseTokenEncryptionKey = (rawInput: string): Buffer => {
	const raw = rawInput.trim();

	if (/^[0-9a-fA-F]{64}$/.test(raw)) {
		return Buffer.from(raw, "hex");
	}

	const base64Buffer = Buffer.from(raw, "base64");
	if (base64Buffer.length === 32) {
		return base64Buffer;
	}

	const utf8Buffer = Buffer.from(raw, "utf8");
	if (utf8Buffer.length === 32) {
		return utf8Buffer;
	}

	throw new Error(
		"DRIVE_TOKEN_ENCRYPTION_KEY must be a 32-byte UTF-8 string, 64-char hex, or 32-byte base64 value",
	);
};

const loadEncryptionKey = (): Buffer => {
	if (encryptionKeyCache) {
		return encryptionKeyCache;
	}

	encryptionKeyCache = parseTokenEncryptionKey(env.DRIVE_TOKEN_ENCRYPTION_KEY);
	return encryptionKeyCache;
};

export const encryptTokenWithKey = (value: string, key: Buffer): string => {
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(AES_ALGORITHM, key, iv);

	const encrypted = Buffer.concat([
		cipher.update(value, "utf8"),
		cipher.final(),
	]);

	const authTag = cipher.getAuthTag();
	return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
};

export const decryptTokenWithKey = (ciphertext: string, key: Buffer): string => {
	const [ivHex, authTagHex, encryptedHex] = ciphertext.split(":");

	if (!ivHex || !authTagHex || !encryptedHex) {
		throw new Error("Invalid encrypted token payload");
	}

	const decipher = createDecipheriv(
		AES_ALGORITHM,
		key,
		Buffer.from(ivHex, "hex"),
	);
	decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

	const decrypted = Buffer.concat([
		decipher.update(Buffer.from(encryptedHex, "hex")),
		decipher.final(),
	]);

	return decrypted.toString("utf8");
};

export const encryptToken = (value: string): string => {
	return encryptTokenWithKey(value, loadEncryptionKey());
};

export const decryptToken = (ciphertext: string): string => {
	return decryptTokenWithKey(ciphertext, loadEncryptionKey());
};
