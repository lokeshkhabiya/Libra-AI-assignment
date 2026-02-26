"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Cloud, CloudOff, FileText, Loader2, RefreshCcw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import DriveConnectButton from "@/components/drive-connect-button";
import DriveFileList from "@/components/drive-file-list";
import { Button } from "@/components/ui/button";
import {
	disconnectDrive,
	getDriveStatus,
	listDriveFiles,
	syncDrive,
	type DriveFileRow,
	type DriveStatusResponse,
} from "@/lib/api/drive";
import { cn } from "@/lib/utils";

const formatDate = (value: string | null): string => {
	if (!value) {
		return "Never";
	}

	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return "Never";
	}

	return parsed.toLocaleString();
};

const formatDuration = (durationMs: number): string => {
	if (durationMs < 60_000) {
		return `${Math.max(1, Math.round(durationMs / 1000))}s`;
	}

	const minutes = Math.round(durationMs / 60_000);
	if (minutes < 60) {
		return `${minutes}m`;
	}

	const hours = Math.round(minutes / 60);
	return `${hours}h`;
};

export default function DriveDashboard() {
	const [status, setStatus] = useState<DriveStatusResponse | null>(null);
	const [files, setFiles] = useState<DriveFileRow[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isIncrementalSyncing, setIsIncrementalSyncing] = useState(false);
	const [isFullSyncing, setIsFullSyncing] = useState(false);
	const [isDisconnecting, setIsDisconnecting] = useState(false);

	const loadData = useCallback(async () => {
		setIsLoading(true);
		try {
			const [statusData, filesData] = await Promise.all([
				getDriveStatus(),
				listDriveFiles({ page: 1, pageSize: 50 }),
			]);
			setStatus(statusData);
			setFiles(filesData.items);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to load Drive data");
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadData();
	}, [loadData]);

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		if (params.get("connected") === "1") {
			toast.success("Google Drive connected. Full sync was queued.");
		}

		const error = params.get("error");
		if (error) {
			toast.error(error);
		}
	}, []);

	const onIncrementalSync = async () => {
		setIsIncrementalSyncing(true);
		try {
			const result = await syncDrive(false);
			if (result.alreadyQueued) {
				toast.message("A sync job is already in progress");
			} else {
				toast.success("Incremental sync queued");
			}
			await loadData();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to queue sync");
		} finally {
			setIsIncrementalSyncing(false);
		}
	};

	const onFullSync = async () => {
		setIsFullSyncing(true);
		try {
			const result = await syncDrive(true);
			if (result.alreadyQueued) {
				toast.message("A sync job is already in progress");
			} else {
				toast.success("Full re-sync queued");
			}
			await loadData();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to queue full re-sync");
		} finally {
			setIsFullSyncing(false);
		}
	};

	const onDisconnect = async () => {
		setIsDisconnecting(true);
		try {
			await disconnectDrive();
			toast.success("Google Drive disconnected");
			await loadData();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Disconnect failed");
		} finally {
			setIsDisconnecting(false);
		}
	};

	const statItems = useMemo(() => {
		return [
			{
				label: "Indexed",
				value: status?.filesIndexed ?? 0,
				sub: "Ready for retrieval",
				icon: FileText,
				color: "text-emerald-500",
			},
			{
				label: "Pending",
				value: status?.filesPending ?? 0,
				sub: "Queued for ingestion",
				icon: Loader2,
				color: "text-amber-500",
			},
			{
				label: "Failed",
				value: status?.filesFailed ?? 0,
				sub: "Need retry",
				icon: TriangleAlert,
				color: "text-red-500",
			},
		];
	}, [status]);

	if (isLoading && !status) {
		return (
			<div className="container mx-auto max-w-5xl px-6 py-12">
				<div className="flex items-center gap-2 text-sm text-muted-foreground animate-fade-in">
					<Loader2 className="size-4 animate-spin" /> Loading Drive workspace...
				</div>
			</div>
		);
	}

	return (
		<div className="container mx-auto max-w-5xl px-6 py-8">
			{/* Connection header */}
			<div className="animate-fade-in">
				<div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
					<div className="flex items-start gap-3">
						<div className={cn(
							"mt-0.5 flex size-9 items-center justify-center rounded-xl",
							status?.connected ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"
						)}>
							{status?.connected ? <Cloud className="size-4" /> : <CloudOff className="size-4" />}
						</div>
						<div>
							<h1 className="text-lg font-semibold tracking-tight">Google Drive</h1>
							<p className="text-sm text-muted-foreground">
								Connect and ingest Docs, PDFs, and text files for semantic retrieval.
							</p>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={!status?.connected || isIncrementalSyncing || isFullSyncing}
							onClick={() => {
								void onIncrementalSync();
							}}
						>
							{isIncrementalSyncing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCcw className="size-3.5" />}
							Sync now
						</Button>
						<Button
							variant="outline"
							size="sm"
							disabled={!status?.connected || isIncrementalSyncing || isFullSyncing}
							onClick={() => {
								void onFullSync();
							}}
						>
							{isFullSyncing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCcw className="size-3.5" />}
							Full re-sync
						</Button>
						<DriveConnectButton
							connected={Boolean(status?.connected)}
							busy={isDisconnecting}
							onDisconnect={onDisconnect}
						/>
					</div>
				</div>

				{/* Connection details */}
				{status?.connected && (
					<div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
						<span>
							Account: <span className="font-medium text-foreground">{status.googleAccountEmail}</span>
						</span>
						<span>
							Last sync: <span className="font-medium text-foreground">{formatDate(status.lastSyncedAt ?? null)}</span>
						</span>
						{status.autoSyncEnabled ? (
							<span>
								Auto sync:{" "}
								<span className="font-medium text-foreground">
									Enabled (every {formatDuration(status.autoSyncIntervalMs)})
								</span>
							</span>
						) : null}
						{status.syncJobQueued ? (
							<span>
								Queue: <span className="font-medium text-foreground">Sync job in progress</span>
							</span>
						) : null}
					</div>
				)}
			</div>

			{/* Stats */}
			<div className="mt-8 grid gap-4 sm:grid-cols-3 animate-fade-in" style={{ animationDelay: "80ms" }}>
				{statItems.map((item) => {
					const Icon = item.icon;
					return (
						<div
							key={item.label}
							className="flex items-center gap-4 rounded-xl border border-border/50 bg-card/50 px-5 py-4"
						>
							<div className={cn("flex size-10 items-center justify-center rounded-lg bg-muted/50", item.color)}>
								<Icon className="size-4" />
							</div>
							<div>
								<p className="text-2xl font-semibold tabular-nums">{item.value}</p>
								<p className="text-[11px] text-muted-foreground">{item.label}</p>
							</div>
						</div>
					);
				})}
			</div>

			{/* File list */}
			<div className="mt-8 animate-fade-in" style={{ animationDelay: "160ms" }}>
				<DriveFileList files={files} />
			</div>
		</div>
	);
}
