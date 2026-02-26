import { extractText, getDocumentProxy } from "unpdf";

import { ApiError } from "@libra-ai/drive-core";

type ExtractTargetFile = {
	googleFileId: string;
	mimeType: string;
	name: string;
};

const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const PDF_MIME = "application/pdf";
const TEXT_MIMES = new Set(["text/plain", "text/markdown"]);

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
	const pdf = await getDocumentProxy(new Uint8Array(buffer));
	const { text } = await extractText(pdf, { mergePages: true });

	return text ?? "";
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

export const extractDriveFileText = async (
	drive: any,
	file: ExtractTargetFile,
): Promise<string> => {
	if (file.mimeType === GOOGLE_DOC_MIME) {
		return extractGoogleDocText(drive, file.googleFileId);
	}

	if (file.mimeType === PDF_MIME) {
		return extractPdfText(drive, file.googleFileId);
	}

	if (TEXT_MIMES.has(file.mimeType)) {
		return extractTextFile(drive, file.googleFileId);
	}

	throw new ApiError(
		400,
		"UNSUPPORTED_FILE_TYPE",
		`Unsupported file type for extraction: ${file.mimeType}`,
	);
};
