import type { AgentToolName } from "@/agent/types";
import { driveRetrieveTool } from "@/agent/tools/drive-retrieve";
import type { ToolDefinition } from "@/agent/tools/types";
import { vectorSearchTool } from "@/agent/tools/vector-search";
import { webScrapeTool } from "@/agent/tools/web-scrape";
import { webSearchTool } from "@/agent/tools/web-search";

const tools: ToolDefinition[] = [
	webSearchTool,
	webScrapeTool,
	driveRetrieveTool,
	vectorSearchTool,
];

export const toolRegistry = new Map<AgentToolName, ToolDefinition>(
	tools.map((tool) => [tool.name, tool]),
);

export const getRegisteredTools = (): ToolDefinition[] => {
	return [...tools];
};

export const getTool = (toolName: AgentToolName): ToolDefinition | null => {
	return toolRegistry.get(toolName) ?? null;
};
