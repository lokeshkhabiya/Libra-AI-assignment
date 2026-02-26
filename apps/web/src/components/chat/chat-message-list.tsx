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
			<div className="flex flex-1 min-h-0 items-center justify-center">
				<div className="flex items-center gap-2.5 text-xs text-muted-foreground animate-fade-in">
					<Loader2 className="size-4 animate-spin" />
					Loading task...
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-4 py-8">
			<div className="mx-auto w-full max-w-3xl space-y-8">
				{messages.map((message, index) =>
					message.role === "user" ? (
						<div key={message.id} className="animate-fade-in" style={{ animationDelay: `${index * 40}ms` }}>
							<UserMessage message={message} />
						</div>
					) : (
						<div key={message.id} className="animate-fade-in" style={{ animationDelay: `${index * 40}ms` }}>
							<AssistantMessage message={message} />
						</div>
					),
				)}
				<div ref={bottomRef} />
			</div>
		</div>
	);
}
