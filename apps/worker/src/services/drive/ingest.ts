import prisma from "@libra-ai/db";

import {
	deleteFileRecords,
	getPineconeIndexMode,
	getPineconeVectorDimension,
	upsertDocuments,
	INGEST_JOB_NAME,
	INDEX_ERROR_MESSAGE_MAX,
	embedTextsWithOptions,
	embeddingModel,
	sanitizeDbText,
} from "@libra-ai/drive-core";

import { extractDriveFileText } from "./extract";
import { getDriveClientForFile } from "./google-client";
import { chunkText } from "./chunk";

export type DriveIngestParams = {
	driveFileId: string;
	userId: string;
	forceReingest?: boolean;
};

const normalizeText = (text: string): string => {
	return sanitizeDbText(text)
		.replace(/\u0000/g, "")
		.replace(/\r/g, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
};

const truncateError = (value: unknown): string => {
	const message = sanitizeDbText(
		value instanceof Error ? value.message : String(value),
	);
	if (message.length <= INDEX_ERROR_MESSAGE_MAX) {
		return message;
	}

	return `${message.slice(0, INDEX_ERROR_MESSAGE_MAX - 3)}...`;
};

const vectorIdForChunk = (driveFileId: string, chunkIndex: number): string => {
	return `drive_${driveFileId}_${chunkIndex}`;
};

export const ingestDriveFile = async ({
	driveFileId,
	userId,
	forceReingest = false,
}: DriveIngestParams): Promise<void> => {
	const startedAt = Date.now();
	const { drive, driveFile } = await getDriveClientForFile({
		driveFileId,
		userId,
	});

	const logCtx = { driveFileId, userId, fileName: driveFile.name, mimeType: driveFile.mimeType };

	if (driveFile.isDeleted) {
		console.log("[ingest] skipping deleted file", logCtx);
		return;
	}

	console.log("[ingest] starting", { ...logCtx, forceReingest });

	await prisma.driveFile.update({
		where: { id: driveFile.id },
		data: {
			indexStatus: "PENDING",
			indexError: null,
		},
	});

	try {
		console.log("[ingest] extracting text", logCtx);
		const rawText = await extractDriveFileText(drive, {
			googleFileId: driveFile.googleFileId,
			mimeType: driveFile.mimeType,
			name: driveFile.name,
		});

		const normalized = normalizeText(rawText);
		if (!normalized) {
			console.log("[ingest] skipped — no extractable text", logCtx);
			await prisma.driveFile.update({
				where: { id: driveFile.id },
				data: {
					indexStatus: "SKIPPED",
					indexError: "No extractable text found in file",
					chunkCount: 0,
					lastIndexedAt: new Date(),
				},
			});
			return;
		}

		console.log("[ingest] extracted text", { ...logCtx, chars: normalized.length });

		if (forceReingest || driveFile.chunkCount > 0) {
			console.log("[ingest] clearing existing vectors and chunks", { ...logCtx, previousChunkCount: driveFile.chunkCount });
			await deleteFileRecords(userId, driveFile.id);
			await prisma.driveChunk.deleteMany({
				where: { driveFileId: driveFile.id },
			});
		}

		const chunks = chunkText(normalized);

		if (chunks.length === 0) {
			console.log("[ingest] skipped — no chunks generated", logCtx);
			await prisma.driveFile.update({
				where: { id: driveFile.id },
				data: {
					indexStatus: "SKIPPED",
					indexError: "No chunks generated from extracted text",
					chunkCount: 0,
					lastIndexedAt: new Date(),
				},
			});
			return;
		}

		console.log("[ingest] chunked", { ...logCtx, chunkCount: chunks.length });

		const namespace = `user_${userId}`;
		const indexMode = await getPineconeIndexMode();
		let records: Array<{
			id: string;
			content: string;
			values?: number[];
			metadata: {
				driveFileId: string;
				googleFileId: string;
				fileName: string;
				mimeType: string;
				chunkIndex: number;
				userId: string;
			};
		}> = chunks.map((chunk) => ({
			id: vectorIdForChunk(driveFile.id, chunk.chunkIndex),
			content: chunk.content,
			metadata: {
				driveFileId: driveFile.id,
				googleFileId: driveFile.googleFileId,
				fileName: driveFile.name,
				mimeType: driveFile.mimeType,
				chunkIndex: chunk.chunkIndex,
				userId,
			},
		}));

		if (indexMode === "vector") {
			console.log("[ingest] generating embeddings", { ...logCtx, chunkCount: chunks.length });
			const vectorDimension = await getPineconeVectorDimension();
			const embeddings = await embedTextsWithOptions(
				chunks.map((chunk) => chunk.content),
				{
					dimensions: vectorDimension ?? undefined,
				},
			);

			if (embeddings.length !== chunks.length) {
				throw new Error(
					`Expected ${chunks.length} embeddings but received ${embeddings.length}`,
				);
			}

			console.log("[ingest] embeddings ready", { ...logCtx, embeddingCount: embeddings.length });

			records = records.map((record, index) => ({
				...record,
				values: embeddings[index] ?? [],
			}));
		}

		console.log("[ingest] upserting to Pinecone", { ...logCtx, indexMode, recordCount: records.length });
		await upsertDocuments(userId, records);

		console.log("[ingest] saving chunks to db", { ...logCtx, chunkCount: chunks.length });
		await prisma.$transaction([
			prisma.driveChunk.createMany({
				data: chunks.map((chunk) => ({
					userId,
					driveFileId: driveFile.id,
					chunkIndex: chunk.chunkIndex,
					content: chunk.content,
					tokenCount: chunk.tokenCount,
					namespace,
					vectorId: vectorIdForChunk(driveFile.id, chunk.chunkIndex),
					embeddingModel:
						indexMode === "vector" ? embeddingModel : "pinecone-integrated",
					metadata: {
						mimeType: driveFile.mimeType,
						googleFileId: driveFile.googleFileId,
						fileName: driveFile.name,
						chunkIndex: chunk.chunkIndex,
					},
				})),
			}),
			prisma.driveFile.update({
				where: { id: driveFile.id },
				data: {
					indexStatus: "INDEXED",
					indexError: null,
					chunkCount: chunks.length,
					lastIndexedAt: new Date(),
				},
			}),
		]);

		console.log("[ingest] done", {
			...logCtx,
			chunkCount: chunks.length,
			indexMode,
			durationMs: Date.now() - startedAt,
		});
	} catch (error) {
		console.error("[ingest] failed", {
			...logCtx,
			error: error instanceof Error ? error.message : String(error),
			durationMs: Date.now() - startedAt,
		});
		await prisma.driveFile.update({
			where: { id: driveFile.id },
			data: {
				indexStatus: "FAILED",
				indexError: truncateError(error),
			},
		});
		throw error;
	}
};

export const enqueueingMetadata = {
	jobName: INGEST_JOB_NAME,
};
