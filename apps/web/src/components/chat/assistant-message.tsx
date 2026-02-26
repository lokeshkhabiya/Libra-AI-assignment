"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { ChatMessage } from "@/lib/chat-store";

import CitationList from "./citation-list";
import StepProgress from "./step-progress";

export default function AssistantMessage({ message }: { message: ChatMessage }) {
	const plannedSteps = message.plannedSteps ?? [];
	const steps = message.steps ?? [];
	const observeLog = message.observeLog ?? [];
	const hasExecutionData = plannedSteps.length > 0 || steps.length > 0;

	if (message.status === "streaming" && !message.content) {
		return (
			<div className="max-w-[85%]">
				{hasExecutionData ? (
					<StepProgress
						plannedSteps={plannedSteps}
						steps={steps}
						observeLog={observeLog}
						isComplete={false}
					/>
				) : (
					<div className="flex items-center gap-2.5 text-sm text-muted-foreground">
						<Loader2 className="size-4 animate-spin" />
						<span>Planning...</span>
					</div>
				)}
			</div>
		);
	}

	if (message.status === "error") {
		return (
			<div className="max-w-[85%]">
				<div className="flex items-start gap-2.5 rounded-xl bg-red-500/5 border border-red-500/10 px-4 py-3 text-sm text-red-400">
					<AlertCircle className="mt-0.5 size-4 shrink-0" />
					<span>{message.content}</span>
				</div>
			</div>
		);
	}

	return (
		<div className="max-w-[85%]">
			{hasExecutionData && (
				<StepProgress
					plannedSteps={plannedSteps}
					steps={steps}
					observeLog={observeLog}
					isComplete={message.status === "complete"}
				/>
			)}
			<div className="prose prose-sm max-w-none text-sm leading-relaxed dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-p:text-foreground/90 prose-p:leading-relaxed [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-border/50 [&_pre]:bg-muted/30 [&_pre]:p-4 [&_code]:rounded-md [&_code]:bg-muted/50 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_code]:before:content-none [&_code]:after:content-none [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_a]:text-primary [&_a]:underline-offset-2 [&_a]:decoration-primary/30 hover:[&_a]:decoration-primary [&_ul]:list-disc [&_ol]:list-decimal [&_li]:marker:text-muted-foreground [&_blockquote]:border-l-primary/30 [&_blockquote]:text-muted-foreground [&_hr]:border-border/50 [&_table]:text-xs [&_th]:text-muted-foreground [&_th]:font-medium [&_td]:border-border/50 [&_th]:border-border/50">
				<Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
			</div>
			{message.citations && <CitationList citations={message.citations} />}
		</div>
	);
}
