"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import ChatInputBar from "@/components/chat-input-bar";
import ChatMessageList from "@/components/chat/chat-message-list";
import CitationPanel from "@/components/citation-panel";
import DriveConnectDialog from "@/components/drive-connect-dialog";
import DriveFilePicker from "@/components/drive-file-picker";
import TaskSidebar from "@/components/task-sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/lib/chat-store";
import { useDriveStore } from "@/lib/drive-store";

const taskStatusClassName: Record<string, string> = {
	QUEUED: "bg-amber-100 text-amber-900",
	RUNNING: "bg-blue-100 text-blue-900",
	COMPLETED: "bg-emerald-100 text-emerald-900",
	FAILED: "bg-red-100 text-red-900",
	CANCELED: "bg-zinc-200 text-zinc-800",
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
	const isHydratingTask = useChatStore((s) => s.isHydratingTask);
	const isStreaming = useChatStore((s) => s.isStreaming);
	const selectTask = useChatStore((s) => s.selectTask);
	const startNewTask = useChatStore((s) => s.startNewTask);
	const cancelActiveTask = useChatStore((s) => s.cancelActiveTask);
	const activeCitationFileId = useChatStore((s) => s.activeCitationFileId);

	const [showDriveConnect, setShowDriveConnect] = useState(false);
	const [showFilePicker, setShowFilePicker] = useState(false);

	const activeTask = useMemo(() => {
		if (!activeTaskId) {
			return null;
		}
		return tasks.find((task) => task.id === activeTaskId) ?? null;
	}, [activeTaskId, tasks]);

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
		<div className="flex h-full min-h-0">
			<TaskSidebar />

			<div className="flex min-w-0 flex-1 flex-col">
				<div className="border-b border-border/70 px-3 py-2 md:hidden">
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

				{activeTask ? (
					<div className="flex items-center justify-between border-b border-border/70 px-4 py-2">
						<div className="min-w-0">
							<p className="truncate text-xs font-medium">{activeTask.title || activeTask.prompt}</p>
							<p className="text-[11px] text-muted-foreground">
								{activeTask.stepsCompleted}/{activeTask.maxSteps} steps
							</p>
						</div>
						<div className="flex items-center gap-2">
							<span
								className={cn(
									"inline-flex rounded-none px-1.5 py-0.5 text-[10px] font-semibold",
									taskStatusClassName[activeTask.status] ?? "bg-zinc-200 text-zinc-800",
								)}
							>
								{activeTask.status}
							</span>
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
				) : null}

				<div className="min-h-0 flex-1">
					<ChatMessageList />
				</div>
				<ChatInputBar onOpenFilePicker={() => setShowFilePicker(true)} />
			</div>

			{activeCitationFileId && <CitationPanel />}

			<DriveConnectDialog
				open={showDriveConnect}
				onSkip={() => setShowDriveConnect(false)}
			/>

			<DriveFilePicker
				open={showFilePicker}
				onClose={() => setShowFilePicker(false)}
			/>
		</div>
	);
}
