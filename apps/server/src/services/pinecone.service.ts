import { env } from "@libra-ai/env/server";
import { Pinecone } from "@pinecone-database/pinecone";

const pc = new Pinecone({ apiKey: env.PINECONE_API_KEY });

const index = pc.index({ name: env.PINECONE_INDEX });

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
	const namespace = `user_${userId}`;
	const BATCH_SIZE = 96;

	for (let i = 0; i < records.length; i += BATCH_SIZE) {
		const batch = records.slice(i, i + BATCH_SIZE);
		await index.namespace(namespace).upsertRecords({ records: batch });
	}
}

export async function searchDocuments(
	userId: string,
	query: string,
	topK: number = 5,
): Promise<SearchResult[]> {
	const namespace = `user_${userId}`;

	const results = await index.namespace(namespace).searchRecords({
		query: {
			topK: topK * 2,
			inputs: { text: query },
		},
		rerank: {
			model: "bge-reranker-v2-m3",
			topN: topK,
			rankFields: ["content"],
		},
	});

	return results.result.hits.map((hit) => {
		const fields = hit.fields as Record<string, unknown>;
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
	const namespace = `user_${userId}`;

	const allIds: string[] = [];
	let paginationToken: string | undefined;

	while (true) {
		const result = await index.namespace(namespace).listPaginated({
			prefix: `${fileId}_`,
			limit: 1000,
			paginationToken,
		});

		const vectors = result.vectors ?? [];
		for (const v of vectors) {
			if (v.id) allIds.push(v.id);
		}

		if (!result.pagination?.next) break;
		paginationToken = result.pagination.next;
	}

	if (allIds.length > 0) {
		await index.namespace(namespace).deleteMany(allIds);
	}
}

export async function deleteUserNamespace(userId: string): Promise<void> {
	const namespace = `user_${userId}`;
	await index.namespace(namespace).deleteAll();
}

export async function getIndexStats(userId?: string) {
	const stats = await index.describeIndexStats();

	if (userId) {
		const namespace = `user_${userId}`;
		return stats.namespaces?.[namespace] ?? { recordCount: 0 };
	}

	return stats;
}
