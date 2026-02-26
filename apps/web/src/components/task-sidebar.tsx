"use client";

import { Loader2, Plus, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/lib/chat-store";

const statusClassName: Record<string, string> = {
	QUEUED: "bg-amber-100 text-amber-900",
	RUNNING: "bg-blue-100 text-blue-900",
	COMPLETED: "bg-emerald-100 text-emerald-900",
	FAILED: "bg-red-100 text-red-900",
	CANCELED: "bg-zinc-200 text-zinc-800",
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
	const tasks = useChatStore((state) => state.tasks);
	const activeTaskId = useChatStore((state) => state.activeTaskId);
	const isLoadingTasks = useChatStore((state) => state.isLoadingTasks);
	const isStreaming = useChatStore((state) => state.isStreaming);
	const fetchTasks = useChatStore((state) => state.fetchTasks);
	const selectTask = useChatStore((state) => state.selectTask);
	const startNewTask = useChatStore((state) => state.startNewTask);

	return (
		<aside className="hidden w-72 shrink-0 border-r border-border/80 bg-card/70 md:flex md:flex-col">
			<div className="flex items-center justify-between border-b border-border/70 px-3 py-3">
				<div>
					<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Tasks
					</p>
					<p className="text-[11px] text-muted-foreground">{tasks.length} total</p>
				</div>
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
						variant="outline"
						size="icon-xs"
						title="New task"
						onClick={startNewTask}
						disabled={isStreaming}
					>
						<Plus className="size-3" />
					</Button>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
				{tasks.length === 0 ? (
					<div className="rounded-none border border-dashed border-border/70 p-3 text-[11px] text-muted-foreground">
						No tasks yet. Start by asking a question in the composer.
					</div>
				) : (
					<div className="space-y-1.5">
						{tasks.map((task) => {
							const title = task.title || task.prompt;
							const statusClass =
								statusClassName[task.status] ?? "bg-zinc-200 text-zinc-800";
							const isActive = task.id === activeTaskId;
							return (
								<button
									key={task.id}
									type="button"
									className={cn(
										"w-full rounded-none border px-2.5 py-2 text-left transition-colors",
										isActive
											? "border-primary/60 bg-primary/10"
											: "border-border/70 bg-background hover:bg-muted/50",
									)}
									onClick={() => {
										void selectTask(task.id);
									}}
								>
									<p className="line-clamp-2 text-xs font-medium leading-snug text-foreground">
										{title}
									</p>
									<div className="mt-2 flex items-center justify-between gap-2">
										<span
											className={cn(
												"inline-flex rounded-none px-1.5 py-0.5 text-[10px] font-semibold",
												statusClass,
											)}
										>
											{task.status}
										</span>
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
