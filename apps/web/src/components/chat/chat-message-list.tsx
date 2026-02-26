"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

import { useChatStore } from "@/lib/chat-store";

import AssistantMessage from "./assistant-message";
import UserMessage from "./user-message";

export default function ChatMessageList() {
	const messages = useChatStore((s) => s.messages);
	const isHydratingTask = useChatStore((s) => s.isHydratingTask);
	const activeTaskId = useChatStore((s) => s.activeTaskId);
	const bottomRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	if (isHydratingTask && activeTaskId) {
		return (
			<div className="flex flex-1 items-center justify-center">
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<Loader2 className="size-3.5 animate-spin" />
					Loading task
				</div>
			</div>
		);
	}

	if (messages.length === 0) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center">
				<h2 className="text-xl font-semibold tracking-tight text-foreground/80 md:text-2xl">
					Start A New Task
				</h2>
				<p className="mt-2 text-sm text-muted-foreground">
					Ask anything about your documents and external sources.
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-1 flex-col overflow-y-auto px-4 py-6">
			<div className="mx-auto w-full max-w-3xl space-y-6">
				{messages.map((message) =>
					message.role === "user" ? (
						<UserMessage key={message.id} message={message} />
					) : (
						<AssistantMessage key={message.id} message={message} />
					),
				)}
				<div ref={bottomRef} />
			</div>
		</div>
	);
}
