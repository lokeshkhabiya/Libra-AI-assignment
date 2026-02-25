import OpenAI from "openai";
import { env } from "@libra-ai/env/server";

import { ApiError } from "../errors";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_BATCH_SIZE = 96;
const EMBEDDING_MAX_ATTEMPTS = 4;
const EMBEDDING_BASE_RETRY_MS = 400;

const openai = new OpenAI({
	apiKey: env.OPENAI_API_KEY,
});

const sleep = async (delayMs: number): Promise<void> => {
	await new Promise((resolve) => {
		setTimeout(resolve, delayMs);
	});
};

const computeBackoffDelay = (attempt: number): number => {
	const exponential = EMBEDDING_BASE_RETRY_MS * 2 ** (attempt - 1);
	const jitter = Math.floor(Math.random() * 100);
	return exponential + jitter;
};

const isRetryableEmbeddingError = (error: unknown): boolean => {
	if (!(error instanceof Error)) {
		return false;
	}

	const withStatus = error as Error & { status?: number; code?: string };
	if (
		withStatus.status &&
		[408, 409, 429, 500, 502, 503, 504].includes(withStatus.status)
	) {
		return true;
	}

	return withStatus.code === "ETIMEDOUT" || withStatus.code === "ECONNRESET";
};

const withRetry = async <T>(
	operation: () => Promise<T>,
	maxAttempts: number = EMBEDDING_MAX_ATTEMPTS,
): Promise<T> => {
	let attempt = 0;

	while (attempt < maxAttempts) {
		attempt += 1;

		try {
			return await operation();
		} catch (error) {
			if (!isRetryableEmbeddingError(error) || attempt >= maxAttempts) {
				throw error;
			}

			await sleep(computeBackoffDelay(attempt));
		}
	}

	throw new Error("Embedding operation exhausted retries");
};

export const embedTexts = async (texts: string[]): Promise<number[][]> => {
	return embedTextsWithOptions(texts, {});
};

export const embedTextsWithOptions = async (
	texts: string[],
	options: { dimensions?: number },
): Promise<number[][]> => {
	if (texts.length === 0) {
		return [];
	}

	const vectors: number[][] = [];

	for (let index = 0; index < texts.length; index += EMBEDDING_BATCH_SIZE) {
		const batch = texts.slice(index, index + EMBEDDING_BATCH_SIZE);
		const response = await withRetry(() =>
			openai.embeddings.create({
				model: EMBEDDING_MODEL,
				input: batch,
				dimensions: options.dimensions,
			}),
		);

		if (response.data.length !== batch.length) {
			throw new ApiError(
				502,
				"EMBEDDING_COUNT_MISMATCH",
				`Embedding API returned ${response.data.length} vectors for ${batch.length} inputs`,
			);
		}

		for (const embedding of response.data) {
			vectors.push(embedding.embedding);
		}
	}

	return vectors;
};

export const embedText = async (
	text: string,
	options: { dimensions?: number } = {},
): Promise<number[]> => {
	const vectors = await embedTextsWithOptions([text], options);
	const first = vectors[0];
	if (!first) {
		throw new ApiError(
			502,
			"EMBEDDING_MISSING_VECTOR",
			"Embedding API returned no vector",
		);
	}

	return first;
};

export const embeddingModel = EMBEDDING_MODEL;
