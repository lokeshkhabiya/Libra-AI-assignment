import {
	deleteByFilter,
	deleteNamespace,
	getIndexMode,
	getIndexVectorDimension,
	getIndexStats as vectorGetIndexStats,
	query,
	searchByText,
	upsert,
} from "@libra-ai/vector";

import { embedText } from "./drive/embed";

export type DocumentMetadata = {
	driveFileId: string;
	googleFileId: string;
	fileName: string;
	mimeType: string;
	chunkIndex: number;
	userId: string;
};

export type DocumentRecord = {
	id: string;
	content: string;
	metadata: DocumentMetadata;
	values?: number[];
};

export interface SearchResult {
	id: string;
	score: number;
	driveFileId: string;
	fileName: string;
	mimeType: string;
	chunkIndex: number;
}

const isDelete404 = (error: unknown): boolean => {
	const message = error instanceof Error ? error.message : String(error);
	return message.includes("/vectors/delete returned HTTP status 404");
};

export const getPineconeIndexMode = async (): Promise<"vector" | "integrated"> => {
	return getIndexMode();
};

export const getPineconeVectorDimension = async (): Promise<number | null> => {
	return getIndexVectorDimension();
};

export async function upsertDocuments(
	userId: string,
	records: DocumentRecord[],
): Promise<void> {
	await upsert({ userId, records });
}

export async function searchDocuments(
	userId: string,
	queryText: string,
	topK: number = 5,
): Promise<SearchResult[]> {
	const mode = await getIndexMode();

	if (mode === "integrated") {
		const response = await searchByText({
			userId,
			queryText,
			topK,
			fields: [
				"driveFileId",
				"googleFileId",
				"fileName",
				"mimeType",
				"chunkIndex",
				"userId",
			],
		});

		return response.result.hits.map((hit) => {
			const fields = hit.fields as Record<string, unknown> | undefined;
			return {
				id: hit._id,
				score: hit._score,
				driveFileId: String(fields?.driveFileId ?? ""),
				fileName: String(fields?.fileName ?? ""),
				mimeType: String(fields?.mimeType ?? ""),
				chunkIndex: Number(fields?.chunkIndex ?? -1),
			};
		});
	}

	const vectorDimension = await getIndexVectorDimension();
	const vector = await embedText(queryText, {
		dimensions: vectorDimension ?? undefined,
	});
	const results = await query({
		userId,
		options: {
			topK,
			vector,
			includeMetadata: true,
		},
	});

	return results.matches.map((match) => {
		const metadata = match.metadata;
		return {
			id: match.id,
			score: match.score ?? 0,
			driveFileId: String(metadata?.driveFileId ?? ""),
			fileName: String(metadata?.fileName ?? ""),
			mimeType: String(metadata?.mimeType ?? ""),
			chunkIndex: Number(metadata?.chunkIndex ?? -1),
		};
	});
}

export async function deleteFileRecords(
	userId: string,
	fileId: string,
): Promise<void> {
	try {
		await deleteByFilter({
			userId,
			filter: {
				driveFileId: { $eq: fileId },
			},
		});
	} catch (error) {
		if (isDelete404(error)) {
			return;
		}
		throw error;
	}
}

export async function deleteUserNamespace(userId: string): Promise<void> {
	try {
		await deleteNamespace(userId);
	} catch (error) {
		if (isDelete404(error)) {
			return;
		}
		throw error;
	}
}

type IndexStatsResult = { recordCount?: number | undefined; [key: string]: unknown };

export async function getIndexStats(userId?: string): Promise<IndexStatsResult> {
	const stats = await vectorGetIndexStats();

	if (userId) {
		const namespace = `user_${userId}`;
		return stats.namespaces?.[namespace] ?? { recordCount: 0 };
	}

	return stats;
}
