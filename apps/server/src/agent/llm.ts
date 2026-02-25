import { env } from "@libra-ai/env/server";
import OpenAI from "openai";

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
	temperature = 0.2,
	maxOutputTokens = 1800,
	signal,
}: JsonCompletionParams): Promise<T> => {
	const completion = await openai.chat.completions.create(
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

	const content = extractCompletionText(completion.choices[0]?.message?.content);
	if (!content) {
		throw new Error("LLM returned an empty completion");
	}

	try {
		return JSON.parse(content) as T;
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown parse error";
		throw new Error(`LLM returned invalid JSON: ${message}`);
	}
};
