"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { ChatMessage } from "@/lib/chat-store";

import CitationList from "./citation-list";
import StepProgress from "./step-progress";

export default function AssistantMessage({ message }: { message: ChatMessage }) {
	if (message.status === "streaming" && !message.content) {
		return (
			<div className="max-w-[80%]">
				{message.steps && message.steps.length > 0 ? (
					<StepProgress steps={message.steps} />
				) : (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="size-3.5 animate-spin" />
						<span>Thinking...</span>
					</div>
				)}
			</div>
		);
	}

	if (message.status === "error") {
		return (
			<div className="max-w-[80%]">
				<div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
					<AlertCircle className="mt-0.5 size-4 shrink-0" />
					<span>{message.content}</span>
				</div>
			</div>
		);
	}

	return (
		<div className="max-w-[80%]">
			{message.steps && message.steps.length > 0 && (
				<StepProgress steps={message.steps} />
			)}
			<div className="prose prose-sm max-w-none text-sm leading-relaxed dark:prose-invert [&_pre]:rounded-none [&_pre]:border [&_pre]:border-border/70 [&_pre]:bg-muted/30 [&_pre]:p-3 [&_code]:text-xs [&_a]:text-primary [&_a]:underline-offset-2">
				<Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
			</div>
			{message.citations && <CitationList citations={message.citations} />}
		</div>
	);
}
