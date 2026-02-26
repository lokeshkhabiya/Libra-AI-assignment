"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import ChatInputBar from "@/components/chat-input-bar";
import ChatMessageList from "@/components/chat/chat-message-list";
import dynamic from "next/dynamic";

const CitationPanel = dynamic(() => import("@/components/citation-panel"), { ssr: false });
import DriveConnectDialog from "@/components/drive-connect-dialog";
import DriveFilePicker from "@/components/drive-file-picker";
import TaskSidebar from "@/components/task-sidebar";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/lib/chat-store";
import { useDriveStore } from "@/lib/drive-store";

const statusDot: Record<string, string> = {
	QUEUED: "bg-amber-400",
	RUNNING: "bg-blue-400 animate-pulse",
	COMPLETED: "bg-emerald-400",
	FAILED: "bg-red-400",
	CANCELED: "bg-zinc-400",
};

export default function DashboardShell({ initialTaskId }: { initialTaskId?: string }) {
	const router = useRouter();
	const pathname = usePathname();

	const fetchDriveStatus = useDriveStore((s) => s.fetchStatus);
	const driveStatus = useDriveStore((s) => s.status);
	const driveLoading = useDriveStore((s) => s.isLoading);

	const tasks = useChatStore((s) => s.tasks);
	const fetchTasks = useChatStore((s) => s.fetchTasks);
	const activeTaskId = useChatStore((s) => s.activeTaskId);
	const messages = useChatStore((s) => s.messages);
	const isHydratingTask = useChatStore((s) => s.isHydratingTask);
	const isStreaming = useChatStore((s) => s.isStreaming);
	const selectTask = useChatStore((s) => s.selectTask);
	const startNewTask = useChatStore((s) => s.startNewTask);
	const cancelActiveTask = useChatStore((s) => s.cancelActiveTask);

	const [showDriveConnect, setShowDriveConnect] = useState(false);
	const [showFilePicker, setShowFilePicker] = useState(false);

	const activeTask = useMemo(() => {
		if (!activeTaskId) {
			return null;
		}
		return tasks.find((task) => task.id === activeTaskId) ?? null;
	}, [activeTaskId, tasks]);

	const hasMessages = messages.length > 0 || isHydratingTask;

	useEffect(() => {
		void fetchDriveStatus();
		void fetchTasks();
	}, [fetchDriveStatus, fetchTasks]);

	useEffect(() => {
		if (initialTaskId) {
			void selectTask(initialTaskId);
			return;
		}
		startNewTask();
	}, [initialTaskId, selectTask, startNewTask]);

	useEffect(() => {
		if (isHydratingTask) {
			return;
		}
		if (initialTaskId && !activeTaskId) {
			return;
		}

		if (activeTaskId) {
			const target = `/dashboard/tasks/${activeTaskId}`;
			if (pathname !== target) {
				router.replace(target as never);
			}
			return;
		}

		if (pathname !== "/dashboard") {
			router.replace("/dashboard");
		}
	}, [activeTaskId, initialTaskId, isHydratingTask, pathname, router]);

	useEffect(() => {
		if (!driveLoading && driveStatus && !driveStatus.connected) {
			setShowDriveConnect(true);
		}
	}, [driveStatus, driveLoading]);

	return (
		<SidebarProvider className="h-full min-h-0">
			<TaskSidebar />

			<div className="flex min-w-0 flex-1 flex-col">
				{/* Mobile task switcher */}
				<div className="border-b border-border/40 px-3 py-2 md:hidden">
					<div className="flex items-center gap-1.5 overflow-x-auto">
						<Button
							variant="outline"
							size="xs"
							onClick={startNewTask}
							disabled={isStreaming}
						>
							New task
						</Button>
						{tasks.slice(0, 10).map((task) => (
							<Button
								key={task.id}
								variant={task.id === activeTaskId ? "default" : "ghost"}
								size="xs"
								onClick={() => {
									void selectTask(task.id);
								}}
								className="max-w-[180px] shrink-0 truncate"
							>
								{task.title || task.prompt}
							</Button>
						))}
					</div>
				</div>

				{/* Active task header */}
				{activeTask ? (
					<div className="flex items-center justify-between border-b border-border/40 px-4 py-2.5">
						<div className="flex items-center gap-3 min-w-0">
							<SidebarTrigger className="shrink-0" />
							<div className="min-w-0">
								<p className="truncate text-xs font-medium">{activeTask.title || activeTask.prompt}</p>
								<p className="text-[11px] text-muted-foreground">
									{activeTask.stepsCompleted}/{activeTask.maxSteps} steps
								</p>
							</div>
						</div>
						<div className="flex items-center gap-3">
							<div className="flex items-center gap-1.5">
								<span className={cn("size-2 rounded-full", statusDot[activeTask.status] ?? "bg-zinc-400")} />
								<span className="text-[10px] font-medium text-muted-foreground">
									{activeTask.status}
								</span>
							</div>
							{(activeTask.status === "RUNNING" || activeTask.status === "QUEUED") && (
								<Button
									variant="outline"
									size="xs"
									onClick={() => {
										void cancelActiveTask();
									}}
								>
									{isStreaming ? (
										<Loader2 className="size-3 animate-spin" />
									) : null}
									Cancel
								</Button>
							)}
						</div>
					</div>
				) : (
					<div className="flex items-center border-b border-border/40 px-4 py-2.5">
						<SidebarTrigger />
					</div>
				)}

				{/* Main content: centered input when empty, messages + bottom input when active */}
				{hasMessages ? (
					<>
						<div className="min-h-0 flex-1 flex flex-col overflow-hidden">
							<ChatMessageList />
						</div>
						<ChatInputBar onOpenFilePicker={() => setShowFilePicker(true)} />
					</>
				) : (
					<div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-8">
						<div className="text-center animate-fade-in">
							<h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
								What can I help with?
							</h2>
							<p className="mt-2 text-sm text-muted-foreground">
								Ask anything about your documents and external sources.
							</p>
						</div>
						<div className="w-full max-w-2xl animate-fade-in" style={{ animationDelay: "100ms" }}>
							<ChatInputBar onOpenFilePicker={() => setShowFilePicker(true)} />
						</div>
					</div>
				)}
			</div>

			<CitationPanel />

			<DriveConnectDialog
				open={showDriveConnect}
				onSkip={() => setShowDriveConnect(false)}
			/>

			<DriveFilePicker
				open={showFilePicker}
				onClose={() => setShowFilePicker(false)}
			/>
		</SidebarProvider>
	);
}
