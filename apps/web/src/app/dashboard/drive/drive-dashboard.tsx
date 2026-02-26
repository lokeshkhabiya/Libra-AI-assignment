"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import DriveConnectButton from "@/components/drive-connect-button";
import DriveFileList from "@/components/drive-file-list";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	disconnectDrive,
	getDriveStatus,
	listDriveFiles,
	syncDrive,
	type DriveFileRow,
	type DriveStatusResponse,
} from "@/lib/api/drive";

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

const STAT_CARD_STYLES = [
	"border-l-4 border-l-emerald-500",
	"border-l-4 border-l-amber-500",
	"border-l-4 border-l-red-500",
] as const;

export default function DriveDashboard() {
	const [status, setStatus] = useState<DriveStatusResponse | null>(null);
	const [files, setFiles] = useState<DriveFileRow[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isSyncing, setIsSyncing] = useState(false);
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

	const onSync = async () => {
		setIsSyncing(true);
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
			setIsSyncing(false);
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

	const statCards = useMemo(() => {
		return [
			{
				title: "Indexed",
				value: status?.filesIndexed ?? 0,
				description: "Ready for retrieval",
			},
			{
				title: "Pending",
				value: status?.filesPending ?? 0,
				description: "Queued for ingestion",
			},
			{
				title: "Failed",
				value: status?.filesFailed ?? 0,
				description: "Need retry or file fixes",
			},
		];
	}, [status]);

	if (isLoading && !status) {
		return (
			<div className="container mx-auto max-w-6xl px-4 py-6">
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="size-4 animate-spin" /> Loading Drive workspace...
				</div>
			</div>
		);
	}

	return (
		<div className="relative overflow-hidden">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,oklch(0.90_0.11_160_/_0.35),transparent_60%)]" />
			<div className="container relative mx-auto grid max-w-6xl gap-4 px-4 py-6">
				<Card className="border border-border/70 bg-background/90 backdrop-blur">
					<CardHeader className="flex-row items-center justify-between gap-4">
						<div>
							<CardTitle className="text-lg tracking-tight">Drive Connector</CardTitle>
							<CardDescription>
								Connect your Google Drive and ingest Docs, PDFs, and text files for semantic retrieval.
							</CardDescription>
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								disabled={!status?.connected || isSyncing}
								onClick={() => {
									void onSync();
								}}
							>
								{isSyncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
								Sync now
							</Button>
							<DriveConnectButton
								connected={Boolean(status?.connected)}
								busy={isDisconnecting}
								onDisconnect={onDisconnect}
							/>
						</div>
					</CardHeader>
					<CardContent className="grid gap-2 border-t border-border/70 pt-4 text-xs text-muted-foreground sm:grid-cols-2">
						<p>
							Connection: <span className="font-medium text-foreground">{status?.status ?? "NOT_CONNECTED"}</span>
						</p>
						<p>
							Account: <span className="font-medium text-foreground">{status?.googleAccountEmail ?? "-"}</span>
						</p>
						<p>
							Last sync: <span className="font-medium text-foreground">{formatDate(status?.lastSyncedAt ?? null)}</span>
						</p>
					</CardContent>
				</Card>

				<div className="grid gap-3 md:grid-cols-3">
					{statCards.map((card, index) => {
						return (
							<Card key={card.title} className={STAT_CARD_STYLES[index]}>
								<CardHeader>
									<CardDescription>{card.title}</CardDescription>
									<CardTitle className="text-2xl tabular-nums">{card.value}</CardTitle>
								</CardHeader>
								<CardContent className="text-[11px] text-muted-foreground">{card.description}</CardContent>
							</Card>
						);
					})}
				</div>

				<DriveFileList files={files} />
			</div>
		</div>
	);
}
