import type { AgentContext, AgentToolName, CitationInput } from "@/agent/types";

export type ToolJsonSchema = {
	type: "object";
	properties: Record<string, unknown>;
	required?: string[];
	additionalProperties?: boolean;
};

export type ToolResult = {
	success: boolean;
	data: unknown;
	citations?: CitationInput[];
	truncated?: boolean;
};

export type ToolDefinition = {
	name: AgentToolName;
	description: string;
	parameters: ToolJsonSchema;
	execute: (input: unknown, ctx: AgentContext) => Promise<ToolResult>;
};
