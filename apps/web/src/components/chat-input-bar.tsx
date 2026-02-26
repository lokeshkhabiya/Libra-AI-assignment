"use client";

import { ArrowRight, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { syncDrive } from "@/lib/api/drive";
import { useChatStore } from "@/lib/chat-store";
import { useDriveStore } from "@/lib/drive-store";

const GOOGLE_DRIVE_ICON = (
	<svg width="16" height="16" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
		<path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
		<path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-20.4 35.3c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47" />
		<path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.5l5.85 13.5z" fill="#ea4335" />
		<path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
		<path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
		<path d="m73.4 26.5-10.1-17.5c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 23.8h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
	</svg>
);

export default function ChatInputBar({
	onOpenFilePicker,
}: {
	onOpenFilePicker?: () => void;
}) {
	const [input, setInput] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const isStreaming = useChatStore((s) => s.isStreaming);
	const isHydratingTask = useChatStore((s) => s.isHydratingTask);
	const sendMessage = useChatStore((s) => s.sendMessage);
	const attachedFileIds = useChatStore((s) => s.attachedFileIds);
	const attachedFileNames = useChatStore((s) => s.attachedFileNames);
	const removeAttachedFile = useChatStore((s) => s.removeAttachedFile);
	const driveStatus = useDriveStore((s) => s.status);
	const [isSyncing, setIsSyncing] = useState(false);

	const handleSubmit = useCallback(() => {
		const trimmed = input.trim();
		if (!trimmed || isStreaming || isHydratingTask) return;
		setInput("");
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
		}
		void sendMessage(trimmed);
	}, [input, isStreaming, isHydratingTask, sendMessage]);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	};

	const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		setInput(e.target.value);
		const el = e.target;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
	};

	const handleSync = async () => {
		setIsSyncing(true);
		try {
			await syncDrive();
			toast.success("Sync started");
		} catch {
			toast.error("Failed to start sync");
		} finally {
			setIsSyncing(false);
		}
	};

	const isConnected = driveStatus?.connected;

	return (
		<div className="mx-auto w-full max-w-3xl px-4 pb-4">
			{attachedFileIds.length > 0 && (
				<div className="mb-2 flex flex-wrap gap-1.5">
					{attachedFileIds.map((fileId) => (
						<span
							key={fileId}
							className="inline-flex items-center gap-1 rounded-sm border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground"
						>
							{attachedFileNames.get(fileId) || fileId.slice(0, 8)}
							<button
								type="button"
								onClick={() => removeAttachedFile(fileId)}
								className="ml-0.5 hover:text-foreground"
							>
								<X className="size-2.5" />
							</button>
						</span>
					))}
				</div>
			)}
			<div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
				<textarea
					ref={textareaRef}
					value={input}
					onChange={handleInput}
					onKeyDown={handleKeyDown}
					placeholder="Ask anything..."
					rows={1}
					disabled={isStreaming || isHydratingTask}
					className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none disabled:opacity-50"
				/>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-1.5">
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={onOpenFilePicker}
							disabled={!isConnected}
							title={isConnected ? "Attach files" : "Connect Google Drive first"}
						>
							<Plus className="size-4" />
						</Button>
						{isConnected && (
							<>
								<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] text-muted-foreground">
									{GOOGLE_DRIVE_ICON}
									Google Drive
								</span>
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={() => void handleSync()}
									disabled={isSyncing}
									title="Sync files"
								>
									{isSyncing ? (
										<Loader2 className="size-3.5 animate-spin" />
									) : (
										<RefreshCw className="size-3.5" />
									)}
								</Button>
							</>
						)}
					</div>
					<Button
						variant="default"
						size="icon-sm"
						onClick={handleSubmit}
						disabled={!input.trim() || isStreaming || isHydratingTask}
					>
						{isStreaming || isHydratingTask ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<ArrowRight className="size-4" />
						)}
					</Button>
				</div>
			</div>
		</div>
	);
}
