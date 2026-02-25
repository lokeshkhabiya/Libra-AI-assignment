import { z } from "zod";

import type { ToolDefinition } from "@/agent/tools/types";

const inputSchema = z.object({
	url: z.string().url(),
	maxChars: z.number().int().min(500).max(20000).default(6000),
});

const firecrawlScrapeResponseSchema = z.object({
	success: z.boolean(),
	data: z
		.object({
			markdown: z.string().optional(),
			metadata: z
				.object({
					title: z.string().optional(),
					description: z.string().optional(),
					sourceURL: z.string().optional(),
					statusCode: z.number().int().optional(),
				})
				.optional(),
		})
		.optional(),
});

export const webScrapeTool: ToolDefinition = {
	name: "web_scrape",
	description: "Scrape a public URL and extract readable text content.",
	parameters: {
		type: "object",
		additionalProperties: false,
		required: ["url"],
		properties: {
			url: {
				type: "string",
				description: "HTTP(S) URL to scrape.",
			},
			maxChars: {
				type: "number",
				description: "Maximum number of characters to return from extracted content.",
				default: 6000,
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
			const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					url: parsedInput.data.url,
					formats: ["markdown"],
				}),
				signal: ctx.abortSignal,
			});

			if (!response.ok) {
				const text = await response.text();
				return {
					success: false,
					data: {
						error: `Firecrawl scrape failed with status ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
					},
				};
			}

			const rawPayload = await response.json();
			const payload = firecrawlScrapeResponseSchema.safeParse(rawPayload);
			if (!payload.success) {
				return {
					success: false,
					data: {
						error: "Unexpected Firecrawl scrape response payload",
					},
				};
			}

			const data = payload.data.data;
			const rawContent = data?.markdown ?? "";
			const title =
				data?.metadata?.title ??
				data?.metadata?.description ??
				parsedInput.data.url;
			const truncated = rawContent.length > parsedInput.data.maxChars;
			const content = truncated
				? `${rawContent.slice(0, parsedInput.data.maxChars)}...`
				: rawContent;

			return {
				success: true,
				data: {
					url: parsedInput.data.url,
					title: title || undefined,
					content,
					contentLength: rawContent.length,
				},
				citations: [
					{
						sourceType: "WEB",
						title: title || parsedInput.data.url,
						sourceUrl: parsedInput.data.url,
						excerpt: content.slice(0, 280),
					},
				],
				truncated,
			};
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown scrape error";
			return {
				success: false,
				data: {
					error: message,
				},
			};
		}
	},
};
