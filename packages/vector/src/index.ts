import { env } from "@libra-ai/env/server";
import {
	Pinecone,
	type IntegratedRecord,
	type RecordMetadata,
	type SearchRecordsOptions,
	type SearchRecordsResponse,
} from "@pinecone-database/pinecone";

const pc = new Pinecone({ apiKey: env.PINECONE_API_KEY });
const index = pc.index({ name: env.PINECONE_INDEX });

const toNamespace = (userId: string) => `user_${userId}`;

export type UpsertParams<T extends RecordMetadata = RecordMetadata> = {
	userId: string;
	records: Array<IntegratedRecord<T>>;
	batchSize?: number;
};

export const upsert = async <T extends RecordMetadata = RecordMetadata>({
	userId,
	records,
	batchSize = 96,
}: UpsertParams<T>): Promise<void> => {
	const namespace = toNamespace(userId);

	for (let i = 0; i < records.length; i += batchSize) {
		const batch = records.slice(i, i + batchSize);
		await index.namespace(namespace).upsertRecords({ records: batch });
	}
};

export type QueryParams = {
	userId: string;
	options: Omit<SearchRecordsOptions, "namespace">;
};

export const query = async ({
	userId,
	options,
}: QueryParams): Promise<SearchRecordsResponse> => {
	const namespace = toNamespace(userId);
	return index.namespace(namespace).searchRecords(options);
};

export type DeleteByFilterParams = {
	userId: string;
	filter: NonNullable<SearchRecordsOptions["query"]["filter"]>;
};

export const deleteByFilter = async ({
	userId,
	filter,
}: DeleteByFilterParams): Promise<void> => {
	const namespace = toNamespace(userId);
	await index.namespace(namespace).deleteMany({ filter });
};
