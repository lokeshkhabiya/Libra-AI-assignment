"use client";

import { FileText } from "lucide-react";

import type { ChatMessage } from "@/lib/chat-store";

export default function UserMessage({ message }: { message: ChatMessage }) {
	return (
		<div className="flex justify-end">
			<div className="max-w-[80%]">
				{message.attachedFileIds && message.attachedFileIds.length > 0 && (
					<div className="mb-2 flex flex-wrap gap-1.5 justify-end">
						{message.attachedFileIds.map((fileId, index) => (
							<span
								key={fileId}
								className="inline-flex items-center gap-1 rounded-full bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground"
							>
								<FileText className="size-2.5" />
								{message.attachedFileLabels?.[index] ?? `${fileId.slice(0, 8)}...`}
							</span>
						))}
					</div>
				)}
				<div className="rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground text-sm leading-relaxed">
					{message.content}
				</div>
			</div>
		</div>
	);
}
