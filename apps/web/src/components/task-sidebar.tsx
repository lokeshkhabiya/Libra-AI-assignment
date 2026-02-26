"use client";

import { Loader2, Plus, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/lib/chat-store";

const statusDot: Record<string, string> = {
	QUEUED: "bg-amber-400",
	RUNNING: "bg-blue-400 animate-pulse",
	COMPLETED: "bg-emerald-400",
	FAILED: "bg-red-400",
	CANCELED: "bg-zinc-400",
};

const formatRelativeTime = (value: string): string => {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "Unknown";
	}

	const diffMs = date.getTime() - Date.now();
	const abs = Math.abs(diffMs);
	const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

	if (abs < 60_000) {
		return rtf.format(Math.round(diffMs / 1000), "second");
	}
	if (abs < 3_600_000) {
		return rtf.format(Math.round(diffMs / 60_000), "minute");
	}
	if (abs < 86_400_000) {
		return rtf.format(Math.round(diffMs / 3_600_000), "hour");
	}
	return rtf.format(Math.round(diffMs / 86_400_000), "day");
};

export default function TaskSidebar() {
	const { open } = useSidebar();

	const tasks = useChatStore((state) => state.tasks);
	const activeTaskId = useChatStore((state) => state.activeTaskId);
	const isLoadingTasks = useChatStore((state) => state.isLoadingTasks);
	const isStreaming = useChatStore((state) => state.isStreaming);
	const fetchTasks = useChatStore((state) => state.fetchTasks);
	const selectTask = useChatStore((state) => state.selectTask);
	const startNewTask = useChatStore((state) => state.startNewTask);

	return (
		<aside
			className={cn(
				"hidden shrink-0 border-r border-border/40 bg-muted/30 md:flex md:flex-col overflow-hidden transition-[width] duration-200 ease-linear",
				open ? "w-72" : "w-0",
			)}
		>
			<div className="flex items-center justify-between px-4 py-4">
				<p className="text-xs font-semibold tracking-wide text-foreground">
					Tasks
				</p>
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon-xs"
						title="Refresh tasks"
						onClick={() => {
							void fetchTasks();
						}}
						disabled={isLoadingTasks}
					>
						{isLoadingTasks ? (
							<Loader2 className="size-3 animate-spin" />
						) : (
							<RefreshCw className="size-3" />
						)}
					</Button>
					<Button
						variant="ghost"
						size="icon-xs"
						title="New task"
						onClick={startNewTask}
						disabled={isStreaming}
					>
						<Plus className="size-3" />
					</Button>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
				{tasks.length === 0 ? (
					<div className="rounded-xl border border-dashed border-border/50 p-4 text-center text-[11px] text-muted-foreground">
						No tasks yet. Start by asking a question.
					</div>
				) : (
					<div className="space-y-1">
						{tasks.map((task, index) => {
							const title = task.title || task.prompt;
							const dotClass = statusDot[task.status] ?? "bg-zinc-400";
							const isActive = task.id === activeTaskId;
							return (
								<button
									key={task.id}
									type="button"
									style={{ animationDelay: `${index * 30}ms` }}
									className={cn(
										"animate-fade-in w-full rounded-lg px-3 py-2.5 text-left transition-colors",
										isActive
											? "bg-primary/10 text-foreground"
											: "text-foreground/80 hover:bg-muted/60",
									)}
									onClick={() => {
										void selectTask(task.id);
									}}
								>
									<p className="line-clamp-2 text-xs font-medium leading-snug">
										{title}
									</p>
									<div className="mt-1.5 flex items-center gap-2">
										<span className={cn("size-1.5 rounded-full", dotClass)} />
										<span className="text-[10px] text-muted-foreground">
											{formatRelativeTime(task.createdAt)}
										</span>
									</div>
								</button>
							);
						})}
					</div>
				)}
			</div>
		</aside>
	);
}
