export const AGENT_TOOL_NAMES = [
	"web_search",
	"web_scrape",
	"drive_retrieve",
	"vector_search",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

const TOOL_NAME_TO_PRISMA = {
	web_search: "WEB_SEARCH",
	web_scrape: "WEB_SCRAPE",
	drive_retrieve: "DRIVE_RETRIEVE",
	vector_search: "VECTOR_SEARCH",
} as const;

export type PrismaToolName = (typeof TOOL_NAME_TO_PRISMA)[AgentToolName];

export const toPrismaToolName = (name: AgentToolName): PrismaToolName => {
	return TOOL_NAME_TO_PRISMA[name];
};

type FlatMetadataValue = string | number | boolean | null | string[];

export type CitationInput = {
	sourceType: "WEB" | "DRIVE";
	title?: string | null;
	sourceUrl?: string | null;
	excerpt?: string | null;
	driveFileId?: string | null;
	rank?: number | null;
	score?: number | null;
	metadata?: Record<string, FlatMetadataValue> | null;
};

export type AgentPlanStep = {
	description: string;
	toolName: AgentToolName;
	toolInput: Record<string, unknown>;
};

export type PlannerOutput = {
	steps: AgentPlanStep[];
};

export type ObserverAction = "continue" | "replan" | "finalize";

export type ObserverOutput = {
	action: ObserverAction;
	reasoning: string;
	nextSteps: AgentPlanStep[];
};

export type FinalizerOutput = {
	summary: string;
	answerMarkdown: string;
	confidence: "low" | "medium" | "high";
	citations: CitationInput[];
};

export type AgentEvent =
	| {
		type: "task:start";
		taskId: string;
		maxSteps: number;
	}
	| {
		type: "plan";
		taskId: string;
		steps: AgentPlanStep[];
	}
	| {
		type: "step:start";
		taskId: string;
		stepId: string;
		stepNumber: number;
		planStepIndex: number;
		toolName: AgentToolName;
		description: string;
	}
	| {
		type: "step:complete";
		taskId: string;
		stepId: string;
		stepNumber: number;
		planStepIndex: number;
		toolName: AgentToolName;
		success: boolean;
		summary: string;
	}
	| {
		type: "observe";
		taskId: string;
		action: ObserverAction;
		reasoning: string;
		appendedSteps: number;
	}
	| {
		type: "complete";
		taskId: string;
		result: FinalizerOutput;
	}
	| {
		type: "error";
		taskId: string;
		message: string;
	};

export type AgentContext = {
	taskId: string;
	userId: string;
	abortSignal: AbortSignal;
	emit: (event: AgentEvent) => void;
};

export type AgentTaskRuntime = {
	id: string;
	userId: string;
	prompt: string;
	maxSteps: number;
	model: string | null;
};

export type FinalizationEvidence = {
	stepNumber: number;
	description: string;
	toolName: AgentToolName;
	success: boolean;
	summary: string;
	result: string;
};
