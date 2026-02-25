import prisma from "@libra-ai/db";
import { searchDocuments } from "@libra-ai/drive-core";
import { z } from "zod";

import type { ToolDefinition } from "@/agent/tools/types";

const inputSchema = z.object({
	query: z.string().min(1),
	topK: z.number().int().min(1).max(10).default(5),
});

const toExcerpt = (value: string, maxChars: number): string => {
	if (value.length <= maxChars) {
		return value;
	}

	return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
};

export const vectorSearchTool: ToolDefinition = {
	name: "vector_search",
	description:
		"Search the user Drive vector namespace for semantically relevant chunks.",
	parameters: {
		type: "object",
		additionalProperties: false,
		required: ["query"],
		properties: {
			query: {
				type: "string",
				description: "Semantic search query against indexed Drive chunks.",
			},
			topK: {
				type: "number",
				description: "Number of matches to return. Range: 1-10.",
				default: 5,
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
			const hits = await searchDocuments(
				ctx.userId,
				parsedInput.data.query,
				parsedInput.data.topK,
			);

			if (hits.length === 0) {
				return {
					success: true,
					data: {
						query: parsedInput.data.query,
						matches: [],
					},
				};
			}

			const vectorIds = hits.map((hit) => hit.id);
			const chunks = await prisma.driveChunk.findMany({
				where: {
					userId: ctx.userId,
					vectorId: {
						in: vectorIds,
					},
					driveFile: {
						isDeleted: false,
					},
				},
				select: {
					vectorId: true,
					chunkIndex: true,
					content: true,
					driveFileId: true,
					driveFile: {
						select: {
							name: true,
							webViewLink: true,
							googleFileId: true,
							mimeType: true,
							isDeleted: true,
						},
					},
				},
			});

			const chunkByVectorId = new Map(
				chunks
					.filter((chunk): chunk is typeof chunk & { vectorId: string } => !!chunk.vectorId)
					.map((chunk) => [chunk.vectorId, chunk]),
			);

			const matches = hits
				.map((hit) => {
					const chunk = chunkByVectorId.get(hit.id);
					if (!chunk || chunk.driveFile.isDeleted) {
						return null;
					}

					return {
						vectorId: hit.id,
						score: hit.score,
						driveFileId: chunk.driveFileId,
						fileName: chunk.driveFile.name,
						sourceUrl: chunk.driveFile.webViewLink,
						chunkIndex: chunk.chunkIndex,
						content: toExcerpt(chunk.content, 800),
						mimeType: chunk.driveFile.mimeType,
						googleFileId: chunk.driveFile.googleFileId,
					};
				})
				.filter((match): match is NonNullable<typeof match> => match !== null);

			const citations = matches.map((match, index) => ({
				sourceType: "DRIVE" as const,
				title: match.fileName,
				sourceUrl: match.sourceUrl,
				excerpt: toExcerpt(match.content, 280),
				driveFileId: match.driveFileId,
				rank: index + 1,
				score: match.score,
				metadata: {
					chunkIndex: match.chunkIndex,
					vectorId: match.vectorId,
					mimeType: match.mimeType,
					googleFileId: match.googleFileId,
				},
			}));

			return {
				success: true,
				data: {
					query: parsedInput.data.query,
					matches,
				},
				citations,
			};
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown vector search error";
			return {
				success: false,
				data: {
					error: message,
				},
			};
		}
	},
};
