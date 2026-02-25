import { z } from "zod";

import type { ToolDefinition } from "@/agent/tools/types";

const inputSchema = z.object({
	query: z.string().min(1),
	numResults: z.number().int().min(1).max(10).default(5),
});

const firecrawlWebItemSchema = z.object({
	url: z.string().url().optional(),
	title: z.string().optional(),
	description: z.string().optional(),
	position: z.number().int().optional(),
});

const firecrawlSearchResponseSchema = z.object({
	success: z.boolean(),
	data: z
		.object({
			web: z.array(firecrawlWebItemSchema).optional(),
		})
		.optional(),
});

const toResults = (
	web: z.infer<typeof firecrawlWebItemSchema>[] | undefined,
	numResults: number,
) => {
	const items = (web ?? []).slice(0, numResults);
	return items.map((item, index) => ({
		title: item.title ?? "Untitled result",
		url: item.url ?? "",
		snippet: item.description ?? "",
		position: item.position ?? index + 1,
	}));
};

export const webSearchTool: ToolDefinition = {
	name: "web_search",
	description: "Search the public web and return top organic results.",
	parameters: {
		type: "object",
		additionalProperties: false,
		required: ["query"],
		properties: {
			query: {
				type: "string",
				description: "Natural language search query.",
			},
			numResults: {
				type: "number",
				description: "Maximum number of organic results to return. Range: 1-10.",
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

		const apiKey = process.env.FIRECRAWL_API_KEY;
		if (!apiKey) {
			return {
				success: false,
				data: {
					error: "FIRECRAWL_API_KEY is not configured on the server environment",
				},
			};
		}

		try {
			const response = await fetch("https://api.firecrawl.dev/v2/search", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					query: parsedInput.data.query,
					limit: parsedInput.data.numResults,
					sources: ["web"],
				}),
				signal: ctx.abortSignal,
			});

			if (!response.ok) {
				const text = await response.text();
				return {
					success: false,
					data: {
						error: `Firecrawl search failed with status ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
					},
				};
			}

			const rawPayload = await response.json();
			const payload = firecrawlSearchResponseSchema.safeParse(rawPayload);
			if (!payload.success) {
				return {
					success: false,
					data: {
						error: "Unexpected Firecrawl search response payload",
					},
				};
			}

			const web = payload.data.data?.web ?? [];
			const results = toResults(web, parsedInput.data.numResults);
			const citations = results
				.filter((result) => result.url.length > 0)
				.map((result, index) => ({
					sourceType: "WEB" as const,
					title: result.title,
					sourceUrl: result.url,
					excerpt: result.snippet,
					rank: index + 1,
					metadata: {
						position: result.position,
						query: parsedInput.data.query,
					},
				}));

			return {
				success: true,
				data: {
					query: parsedInput.data.query,
					results,
				},
				citations,
				truncated: web.length > results.length,
			};
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown search error";
			return {
				success: false,
				data: {
					error: message,
				},
			};
		}
	},
};
