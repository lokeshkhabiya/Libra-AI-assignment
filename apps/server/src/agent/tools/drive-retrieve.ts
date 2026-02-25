import prisma from "@libra-ai/db";
import { getAuthorizedDriveClient, sanitizeDbText } from "@libra-ai/drive-core";
import { z } from "zod";

import type { ToolDefinition } from "@/agent/tools/types";

const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const PDF_MIME = "application/pdf";
const TEXT_MIMES = new Set(["text/plain", "text/markdown"]);

const inputSchema = z.object({
	driveFileId: z.string().min(1),
	maxChars: z.number().int().min(1000).max(50000).default(10000),
});

type ExtractTargetFile = {
	googleFileId: string;
	mimeType: string;
	name: string;
};

const isReadableStreamLike = (value: unknown): value is AsyncIterable<Buffer | string> => {
	if (!value || typeof value !== "object") {
		return false;
	}

	return Symbol.asyncIterator in value;
};

const responseDataToText = async (data: unknown): Promise<string> => {
	if (typeof data === "string") {
		return data;
	}

	if (Buffer.isBuffer(data)) {
		return data.toString("utf8");
	}

	if (data instanceof ArrayBuffer) {
		return new TextDecoder().decode(new Uint8Array(data));
	}

	if (isReadableStreamLike(data)) {
		const chunks: Buffer[] = [];
		for await (const chunk of data) {
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		}
		return Buffer.concat(chunks).toString("utf8");
	}

	return "";
};

const responseDataToBuffer = async (data: unknown): Promise<Buffer> => {
	if (Buffer.isBuffer(data)) {
		return data;
	}

	if (data instanceof ArrayBuffer) {
		return Buffer.from(data);
	}

	if (typeof data === "string") {
		return Buffer.from(data, "utf8");
	}

	if (isReadableStreamLike(data)) {
		const chunks: Buffer[] = [];
		for await (const chunk of data) {
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		}
		return Buffer.concat(chunks);
	}

	return Buffer.alloc(0);
};

const extractGoogleDocText = async (drive: any, fileId: string): Promise<string> => {
	const response = await drive.files.export(
		{
			fileId,
			mimeType: "text/plain",
		},
		{
			responseType: "text",
		},
	);

	return responseDataToText(response.data);
};

const extractPdfText = async (drive: any, fileId: string): Promise<string> => {
	const response = await drive.files.get(
		{
			fileId,
			alt: "media",
		},
		{
			responseType: "arraybuffer",
		},
	);

	const buffer = await responseDataToBuffer(response.data);
	const pdfParseModule = await import("pdf-parse");
	const pdfParse = (
		"default" in pdfParseModule ? pdfParseModule.default : pdfParseModule
	) as (dataBuffer: Buffer) => Promise<{ text?: string }>;
	const parsed = await pdfParse(buffer);

	return parsed.text ?? "";
};

const extractTextFile = async (drive: any, fileId: string): Promise<string> => {
	const response = await drive.files.get(
		{
			fileId,
			alt: "media",
		},
		{
			responseType: "arraybuffer",
		},
	);

	return responseDataToText(response.data);
};

const extractDriveFileText = async (drive: any, file: ExtractTargetFile): Promise<string> => {
	if (file.mimeType === GOOGLE_DOC_MIME) {
		return extractGoogleDocText(drive, file.googleFileId);
	}

	if (file.mimeType === PDF_MIME) {
		return extractPdfText(drive, file.googleFileId);
	}

	if (TEXT_MIMES.has(file.mimeType)) {
		return extractTextFile(drive, file.googleFileId);
	}

	throw new Error(`Unsupported file type for extraction: ${file.mimeType}`);
};

const toExcerpt = (value: string, maxChars: number): string => {
	if (value.length <= maxChars) {
		return value;
	}

	return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
};

export const driveRetrieveTool: ToolDefinition = {
	name: "drive_retrieve",
	description:
		"Retrieve raw text content for one indexed Google Drive file by driveFileId.",
	parameters: {
		type: "object",
		additionalProperties: false,
		required: ["driveFileId"],
		properties: {
			driveFileId: {
				type: "string",
				description: "Internal DriveFile id from the database.",
			},
			maxChars: {
				type: "number",
				description: "Maximum content length returned.",
				default: 10000,
			},
		},
	},
	execute: async (input, ctx) => {
		const parsedInput = inputSchema.safeParse(input);
		if (!parsedInput.success) {
			return {
				success: false,
				data: {
					error: parsedInput.error.message,
				},
			};
		}

		try {
			const safeDriveFileId = sanitizeDbText(parsedInput.data.driveFileId);
			const driveFile = await prisma.driveFile.findUnique({
				where: {
					id: safeDriveFileId,
				},
				select: {
					id: true,
					userId: true,
					connectionId: true,
					googleFileId: true,
					name: true,
					mimeType: true,
					webViewLink: true,
					isDeleted: true,
				},
			});

			if (!driveFile || driveFile.userId !== ctx.userId || driveFile.isDeleted) {
				return {
					success: false,
					data: {
						error: "Drive file not found",
					},
				};
			}

			const { drive } = await getAuthorizedDriveClient({
				userId: ctx.userId,
				connectionId: driveFile.connectionId,
			});

			const rawContent = await extractDriveFileText(drive, {
				googleFileId: driveFile.googleFileId,
				mimeType: driveFile.mimeType,
				name: driveFile.name,
			});

			const sanitizedContent = sanitizeDbText(rawContent.trim());
			const truncated = sanitizedContent.length > parsedInput.data.maxChars;
			const content = truncated
				? `${sanitizedContent.slice(0, parsedInput.data.maxChars)}...`
				: sanitizedContent;

			return {
				success: true,
				data: {
					driveFileId: driveFile.id,
					fileName: driveFile.name,
					mimeType: driveFile.mimeType,
					sourceUrl: driveFile.webViewLink,
					content,
					contentLength: sanitizedContent.length,
				},
				citations: [
					{
						sourceType: "DRIVE",
						title: driveFile.name,
						sourceUrl: driveFile.webViewLink,
						excerpt: toExcerpt(content, 280),
						driveFileId: driveFile.id,
					},
				],
				truncated,
			};
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown drive retrieval error";
			return {
				success: false,
				data: {
					error: message,
				},
			};
		}
	},
};
