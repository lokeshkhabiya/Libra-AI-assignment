import type { AgentPlanStep, CitationInput, FinalizationEvidence } from "@/agent/types";

type PromptTool = {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
};

type PlannerDriveFile = {
	driveFileId: string;
	name: string;
	mimeType: string;
	lastIndexedAt: string | null;
};

const stringify = (value: unknown): string => {
	return JSON.stringify(value, null, 2);
};

const toolsToPromptText = (tools: PromptTool[]): string => {
	return tools
		.map((tool) => {
			return `- ${tool.name}: ${tool.description}\n  Parameters schema: ${stringify(
				tool.parameters,
			)}`;
		})
		.join("\n");
};

export const buildPlannerSystemPrompt = (tools: PromptTool[]): string => {
	return [
		"You are an autonomous research planning assistant.",
		"Build a practical execution plan using only the tools below.",
		"Return strictly valid JSON with this shape:",
		`{"steps":[{"description":"...", "toolName":"...", "toolInput":{}}]}`,
		"Rules:",
		"- Use the MINIMUM number of steps truly needed to answer the query. maxSteps is a hard ceiling, NOT a target.",
		"- Simple queries (single doc lookup, direct fact): 1-3 steps.",
		"- Moderate research (multi-source, comparison): 3-5 steps.",
		"- Complex multi-source analysis: 5-7 steps.",
		"- NEVER pad with redundant steps. Stop planning the moment you have a path to a confident answer.",
		"- Use only the provided tool names.",
		"- Keep each step action-oriented and specific.",
		"- Make toolInput minimal and valid for the target tool schema.",
		"- Prefer evidence-gathering first, then synthesis.",
		"- If indexed Drive files are provided and relevant, use vector_search and drive_retrieve.",
		"",
		"Available tools:",
		toolsToPromptText(tools),
	].join("\n");
};

export const buildPlannerUserPrompt = (params: {
	taskPrompt: string;
	maxSteps: number;
	indexedDriveFiles?: PlannerDriveFile[];
}): string => {
	const sections = [
		`Task: ${params.taskPrompt}`,
		`Hard step limit: ${params.maxSteps} (use far fewer — plan only what is truly needed to answer the query).`,
		"Produce the most efficient plan now.",
	];

	if (params.indexedDriveFiles && params.indexedDriveFiles.length > 0) {
		sections.push(
			`Indexed Drive files (for reference when planning):\n${stringify(
				params.indexedDriveFiles,
			)}`,
		);
	}

	return sections.join("\n\n");
};

export const buildObserverSystemPrompt = (tools: PromptTool[]): string => {
	return [
		"You are an execution observer for an autonomous agent.",
		"Given progress so far and latest tool output, choose one next action.",
		'Return strictly valid JSON: {"action":"continue|replan|finalize","reasoning":"...", "nextSteps":[...]}',
		"Rules:",
		"- finalize when evidence is sufficient for a confident answer.",
		"- replan only when current path is insufficient or blocked.",
		"- continue when remaining steps are still useful.",
		"- If action is not replan, nextSteps must be an empty array.",
		"",
		"Available tools:",
		toolsToPromptText(tools),
	].join("\n");
};

export const buildObserverUserPrompt = (params: {
	taskPrompt: string;
	recentSummaries: string[];
	lastStep: AgentPlanStep;
	lastResult: unknown;
	remainingPlannedSteps: AgentPlanStep[];
}): string => {
	return [
		`Task: ${params.taskPrompt}`,
		`Recent step summaries:\n${stringify(params.recentSummaries)}`,
		`Last executed step:\n${stringify(params.lastStep)}`,
		`Last tool result:\n${stringify(params.lastResult)}`,
		`Remaining planned steps:\n${stringify(params.remainingPlannedSteps)}`,
	].join("\n\n");
};

export const buildFinalizerSystemPrompt = (): string => {
	return [
		"You are the final answer synthesizer for a research agent.",
		"Use only the provided evidence and citations.",
		"Return strictly valid JSON with this shape:",
		`{"summary":"...", "answerMarkdown":"...", "confidence":"low|medium|high", "citations":[{"sourceType":"WEB|DRIVE","title":"...","sourceUrl":"...","excerpt":"...","driveFileId":"...","rank":1,"score":0.9,"metadata":{}}]}`,
		"Rules:",
		"- summary should be concise and factual.",
		"- answerMarkdown should be the full, well-structured answer using proper Markdown formatting.",
		"- Use ## headings to organize sections. Use ### for sub-sections when needed.",
		"- Use **bold** for key terms and emphasis. Use bullet points or numbered lists for multiple items.",
		"- Use `inline code` for technical terms, file names, or short values.",
		"- Use fenced code blocks (```language) for any code snippets, commands, or structured data.",
		"- Use > blockquotes for important callouts or direct quotes from sources.",
		"- Use tables (| col1 | col2 |) when comparing items or presenting structured data.",
		"- Use --- horizontal rules to separate major topic shifts.",
		"- Write in clear, concise paragraphs. Avoid walls of text.",
		"- citations should map to actual evidence only.",
		"- keep metadata flat key/value when present.",
	].join("\n");
};

export const buildFinalizerUserPrompt = (params: {
	taskPrompt: string;
	evidence: FinalizationEvidence[];
	citations: CitationInput[];
}): string => {
	return [
		`Task: ${params.taskPrompt}`,
		`Evidence trace:\n${stringify(params.evidence)}`,
		`Candidate citations:\n${stringify(params.citations)}`,
		"Synthesize the final answer now.",
	].join("\n\n");
};
