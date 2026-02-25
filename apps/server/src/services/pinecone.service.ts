import {
	deleteByFilter,
	deleteNamespace,
	getIndexStats as vectorGetIndexStats,
	query,
	upsert,
} from "@libra-ai/vector";

export type DocumentRecord = {
	_id: string;
	content: string;
	source: string;
	fileId: string;
	fileName: string;
	mimeType: string;
	chunkIndex: number;
	[key: string]: string | number;
};

export interface SearchResult {
	id: string;
	score: number;
	content: string;
	source: string;
	fileId: string;
	fileName: string;
}

export async function upsertDocuments(
	userId: string,
	records: DocumentRecord[],
): Promise<void> {
	await upsert<DocumentRecord>({ userId, records });
}

export async function searchDocuments(
	userId: string,
	queryText: string,
	topK: number = 5,
): Promise<SearchResult[]> {
	const results = await query({
		userId,
		options: {
			query: {
				topK: topK * 2,
				inputs: { text: queryText },
			},
			rerank: {
				model: "bge-reranker-v2-m3",
				topN: topK,
				rankFields: ["content"],
			},
		},
	});

	return results.result.hits.map((hit: any) => {
		const fields = hit.fields as Record<string, unknown> | undefined;
		return {
			id: hit._id,
			score: hit._score,
			content: String(fields?.content ?? ""),
			source: String(fields?.source ?? ""),
			fileId: String(fields?.fileId ?? ""),
			fileName: String(fields?.fileName ?? ""),
		};
	});
}

export async function deleteFileRecords(
	userId: string,
	fileId: string,
): Promise<void> {
	await deleteByFilter({
		userId,
		filter: { fileId },
	});
}

export async function deleteUserNamespace(userId: string): Promise<void> {
	await deleteNamespace(userId);
}

export async function getIndexStats(userId?: string) {
	const stats = await vectorGetIndexStats();

	if (userId) {
		const namespace = `user_${userId}`;
		return stats.namespaces?.[namespace] ?? { recordCount: 0 };
	}

	return stats;
}
