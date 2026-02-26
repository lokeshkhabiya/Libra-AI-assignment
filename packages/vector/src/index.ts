import { env } from "@libra-ai/env/server";
import {
	Pinecone,
	type PineconeRecord,
	type QueryOptions,
	type QueryResponse,
	type RecordMetadata,
	type SearchRecordsResponse,
} from "@pinecone-database/pinecone";

const pc = new Pinecone({ apiKey: env.PINECONE_API_KEY });
const index = pc.index({ name: env.PINECONE_INDEX });

const toNamespace = (userId: string) => `user_${userId}`;

type IndexRuntime = {
	mode: "vector" | "integrated";
	textFieldKey: string;
	vectorDimension: number | null;
};

let runtimePromise: Promise<IndexRuntime> | null = null;

const detectIndexRuntime = async (): Promise<IndexRuntime> => {
	try {
		const description = await pc.describeIndex(env.PINECONE_INDEX);
		const typedDescription = description as {
			dimension?: number;
			embed?: { fieldMap?: object; dimension?: number };
		};
		const embed = typedDescription.embed;
		const vectorDimension =
			typeof embed?.dimension === "number"
				? embed.dimension
				: typeof typedDescription.dimension === "number"
					? typedDescription.dimension
					: null;

		if (!embed) {
			return {
				mode: "vector",
				textFieldKey: "text",
				vectorDimension,
			};
		}

		const fieldMap = (embed.fieldMap ?? {}) as Record<string, unknown>;
		const mappedFields = Object.values(fieldMap).filter(
			(value): value is string => typeof value === "string" && value.length > 0,
		);

		return {
			mode: "integrated",
			textFieldKey: mappedFields[0] ?? "text",
			vectorDimension,
		};
	} catch {
		return {
			mode: "vector",
			textFieldKey: "text",
			vectorDimension: null,
		};
	}
};

const getIndexRuntime = async (): Promise<IndexRuntime> => {
	if (!runtimePromise) {
		runtimePromise = detectIndexRuntime();
	}

	return runtimePromise;
};

export const getIndexMode = async (): Promise<"vector" | "integrated"> => {
	const runtime = await getIndexRuntime();
	return runtime.mode;
};

export const getIndexVectorDimension = async (): Promise<number | null> => {
	const runtime = await getIndexRuntime();
	return runtime.vectorDimension;
};

export type UpsertRecord = {
	id: string;
	values?: number[];
	metadata?: RecordMetadata;
	content?: string;
};

export type UpsertParams = {
	userId: string;
	records: UpsertRecord[];
	batchSize?: number;
};

const toIntegratedRecord = (record: UpsertRecord, textFieldKey: string) => {
	const content =
		record.content ??
		(typeof record.metadata?.[textFieldKey] === "string"
			? String(record.metadata[textFieldKey])
			: null);

	if (!content) {
		throw new Error(
			`Integrated index upsert requires content text for record "${record.id}"`,
		);
	}

	return {
		_id: record.id,
		[textFieldKey]: content,
		...(record.metadata ?? {}),
	};
};

export const upsert = async ({
	userId,
	records,
	batchSize = 96,
}: UpsertParams): Promise<void> => {
	const namespace = toNamespace(userId);
	const runtime = await getIndexRuntime();

	if (runtime.mode === "integrated") {
		for (let i = 0; i < records.length; i += batchSize) {
			const batch = records.slice(i, i + batchSize);
			await index.namespace(namespace).upsertRecords({
				records: batch.map((record) =>
					toIntegratedRecord(record, runtime.textFieldKey),
				),
			});
		}
		return;
	}

	for (let i = 0; i < records.length; i += batchSize) {
		const batch = records.slice(i, i + batchSize);
		const vectorBatch = batch.map((record) => {
			if (!record.values) {
				throw new Error(
					`Vector index upsert requires embedding values for record "${record.id}"`,
				);
			}

			const vectorRecord: PineconeRecord<RecordMetadata> = {
				id: record.id,
				values: record.values,
				metadata: record.metadata,
			};

			return vectorRecord;
		});

		await index.namespace(namespace).upsert({ records: vectorBatch });
	}
};

export type QueryParams = {
	userId: string;
	options: QueryOptions;
};

export const query = async ({
	userId,
	options,
}: QueryParams): Promise<QueryResponse<RecordMetadata>> => {
	const runtime = await getIndexRuntime();
	if (runtime.mode !== "vector") {
		throw new Error(
			"Vector query is not available for integrated-embedding Pinecone indexes",
		);
	}

	const namespace = toNamespace(userId);
	return index.namespace(namespace).query(options);
};

export type SearchByTextParams = {
	userId: string;
	queryText: string;
	topK: number;
	fields?: string[];
};

export const searchByText = async ({
	userId,
	queryText,
	topK,
	fields,
}: SearchByTextParams): Promise<SearchRecordsResponse> => {
	const runtime = await getIndexRuntime();
	if (runtime.mode !== "integrated") {
		throw new Error(
			"Text search is only available for integrated-embedding Pinecone indexes",
		);
	}

	const namespace = toNamespace(userId);
	return index.namespace(namespace).searchRecords({
		query: {
			topK,
			inputs: { text: queryText },
		},
		rerank: {
			model: "bge-reranker-v2-m3",
			topN: topK,
			rankFields: [runtime.textFieldKey],
		},
		fields,
	});
};

export type DeleteByFilterParams = {
	userId: string;
	filter: Record<string, unknown>;
};

export const deleteByFilter = async ({
	userId,
	filter,
}: DeleteByFilterParams): Promise<void> => {
	const runtime = await getIndexRuntime();
	if (runtime.mode !== "vector") {
		return;
	}

	const namespace = toNamespace(userId);
	await index.namespace(namespace).deleteMany({ filter });
};

export const deleteNamespace = async (userId: string): Promise<void> => {
	const runtime = await getIndexRuntime();
	if (runtime.mode !== "vector") {
		return;
	}

	const namespace = toNamespace(userId);
	await index.namespace(namespace).deleteAll();
};

export const getIndexStats = async () => {
	return index.describeIndexStats();
};
