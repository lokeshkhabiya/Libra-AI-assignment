import { env } from "@libra-ai/env/server";
import OpenAI from "openai";

import { logger } from "@/agent/logger";

const openai = new OpenAI({
	apiKey: env.OPENAI_API_KEY,
});

export const DEFAULT_AGENT_MODEL = "gpt-5.2";

type LlmMessage = {
	role: "system" | "user" | "assistant";
	content: string;
};

type JsonCompletionParams = {
	messages: LlmMessage[];
	model?: string;
	label?: string;
	temperature?: number;
	maxOutputTokens?: number;
	signal?: AbortSignal;
};

const extractCompletionText = (content: unknown): string => {
	if (typeof content === "string") {
		return content;
	}

	if (Array.isArray(content)) {
		const textParts: string[] = [];
		for (const part of content) {
			if (
				part &&
				typeof part === "object" &&
				"type" in part &&
				(part as { type?: unknown }).type === "text" &&
				"text" in part &&
				typeof (part as { text?: unknown }).text === "string"
			) {
				textParts.push((part as { text: string }).text);
			}
		}

		return textParts.join("\n").trim();
	}

	return "";
};

export const createJsonCompletion = async <T>({
	messages,
	model = DEFAULT_AGENT_MODEL,
	label = "llm",
	temperature = 0.2,
	maxOutputTokens = 1800,
	signal,
}: JsonCompletionParams): Promise<T> => {
	const startMs = Date.now();

	logger.debug(`${label}:call:start`, {
		model,
		messageCount: messages.length,
		maxOutputTokens,
	});

	let completion: Awaited<ReturnType<typeof openai.chat.completions.create>>;
	try {
		completion = await openai.chat.completions.create(
			{
				model,
				temperature,
				max_completion_tokens: maxOutputTokens,
				response_format: {
					type: "json_object",
				},
				messages,
			},
			{
				signal,
			},
		);
	} catch (error) {
		const durationMs = Date.now() - startMs;
		logger.error(`${label}:call:error`, {
			model,
			durationMs,
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}

	const durationMs = Date.now() - startMs;
	logger.debug(`${label}:call:end`, {
		model,
		durationMs,
		promptTokens: completion.usage?.prompt_tokens,
		completionTokens: completion.usage?.completion_tokens,
		finishReason: completion.choices[0]?.finish_reason,
	});

	const content = extractCompletionText(completion.choices[0]?.message?.content);
	if (!content) {
		throw new Error("LLM returned an empty completion");
	}

	try {
		return JSON.parse(content) as T;
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown parse error";
		logger.error(`${label}:parse:error`, {
			model,
			error: message,
			contentPreview: content.slice(0, 200),
		});
		throw new Error(`LLM returned invalid JSON: ${message}`);
	}
};
