import prisma from "@libra-ai/db";

import { searchDocuments, type SearchResult } from "@libra-ai/drive-core";

export type DriveCitationResult = {
	sourceType: "DRIVE";
	driveFileId: string;
	title: string;
	sourceUrl: string | null;
	excerpt: string;
	score: number;
	metadata: {
		chunkIndex: number;
		vectorId: string;
		mimeType: string;
		googleFileId: string;
	};
};

export type RetrieveDriveCitationsParams = {
	userId: string;
	queryText: string;
	topK?: number;
	maxExcerptChars?: number;
};

const toExcerpt = (value: string, maxChars: number): string => {
	if (value.length <= maxChars) {
		return value;
	}

	return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
};

export const retrieveDriveCitations = async ({
	userId,
	queryText,
	topK = 5,
	maxExcerptChars = 280,
}: RetrieveDriveCitationsParams): Promise<DriveCitationResult[]> => {
	const hits = await searchDocuments(userId, queryText, topK);
	if (hits.length === 0) {
		return [];
	}

	const vectorIds = hits.map((hit) => hit.id);
	const chunks = await prisma.driveChunk.findMany({
		where: {
			userId,
			vectorId: { in: vectorIds },
			driveFile: {
				isDeleted: false,
			},
		},
		select: {
			driveFileId: true,
			chunkIndex: true,
			content: true,
			vectorId: true,
			driveFile: {
				select: {
					name: true,
					webViewLink: true,
					mimeType: true,
					googleFileId: true,
					isDeleted: true,
				},
			},
		},
	});

	const chunksByVectorId = new Map(
		chunks
			.filter((chunk): chunk is typeof chunk & { vectorId: string } => !!chunk.vectorId)
			.map((chunk) => [chunk.vectorId, chunk]),
	);

	const citations: DriveCitationResult[] = [];

	for (const hit of hits) {
		const chunk = chunksByVectorId.get(hit.id);
		if (!chunk || chunk.driveFile.isDeleted) {
			continue;
		}

		citations.push({
			sourceType: "DRIVE",
			driveFileId: chunk.driveFileId,
			title: chunk.driveFile.name,
			sourceUrl: chunk.driveFile.webViewLink,
			excerpt: toExcerpt(chunk.content, maxExcerptChars),
			score: hit.score,
			metadata: {
				chunkIndex: chunk.chunkIndex,
				vectorId: hit.id,
				mimeType: chunk.driveFile.mimeType,
				googleFileId: chunk.driveFile.googleFileId,
			},
		});
	}

	return citations;
};

export const toTaskCitationPayloads = (
	citations: DriveCitationResult[],
): Array<{
	sourceType: "DRIVE";
	title: string;
	sourceUrl: string | null;
	excerpt: string;
	driveFileId: string;
	rank: number;
	score: number;
	metadata: DriveCitationResult["metadata"];
}> => {
	return citations.map((citation, index) => ({
		sourceType: citation.sourceType,
		title: citation.title,
		sourceUrl: citation.sourceUrl,
		excerpt: citation.excerpt,
		driveFileId: citation.driveFileId,
		rank: index + 1,
		score: citation.score,
		metadata: citation.metadata,
	}));
};

export const toSearchSummaries = (hits: SearchResult[]): string[] => {
	return hits.map(
		(hit) =>
			`${hit.fileName} (chunk ${hit.chunkIndex}, score=${hit.score.toFixed(3)})`,
	);
};
