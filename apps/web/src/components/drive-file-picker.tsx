"use client";

import { FileText, Folder, Loader2, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { env } from "@libra-ai/env/web";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	getDrivePickerToken,
	listDriveFiles,
	pickerSelectDriveFiles,
	type DriveFileRow,
} from "@/lib/api/drive";
import { useChatStore } from "@/lib/chat-store";

function FileIcon({ mimeType }: { mimeType: string }) {
	if (mimeType.includes("folder")) {
		return <Folder className="size-4 text-muted-foreground" />;
	}
	return <FileText className="size-4 text-muted-foreground" />;
}

function formatDate(dateStr: string | null): string {
	if (!dateStr) return "—";
	return new Date(dateStr).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

type GooglePickerDocument = {
	id?: string;
};

type GooglePickerResponse = {
	[key: string]: unknown;
};

declare global {
	interface Window {
		gapi?: {
			load: (library: string, callback: () => void) => void;
		};
		google?: {
			picker: {
				Action: { PICKED: string };
				Response: { ACTION: string; DOCUMENTS: string };
				Feature: { MULTISELECT_ENABLED: string };
				ViewId: { DOCS: string };
				DocsView: new (viewId: string) => {
					setIncludeFolders: (value: boolean) => unknown;
					setSelectFolderEnabled: (value: boolean) => unknown;
					setMimeTypes: (value: string) => unknown;
				};
				PickerBuilder: new () => PickerBuilderChain;
			};
		};
	}
}

type PickerBuilderChain = {
	setOAuthToken: (token: string) => PickerBuilderChain;
	setDeveloperKey: (key: string) => PickerBuilderChain;
	enableFeature: (feature: string) => PickerBuilderChain;
	addView: (view: unknown) => PickerBuilderChain;
	setCallback: (callback: (response: GooglePickerResponse) => void) => PickerBuilderChain;
	build: () => { setVisible: (visible: boolean) => void };
};

let pickerSdkPromise: Promise<void> | null = null;

const PICKER_SUPPORTED_MIME_TYPES = [
	"application/vnd.google-apps.document",
	"application/pdf",
	"text/plain",
	"text/markdown",
].join(",");

const loadGooglePickerSdk = async (): Promise<void> => {
	if (typeof window === "undefined") {
		return;
	}

	if (window.gapi?.load && window.google?.picker) {
		return;
	}

	if (!pickerSdkPromise) {
		pickerSdkPromise = new Promise<void>((resolve, reject) => {
			const existingScript = document.querySelector<HTMLScriptElement>(
				'script[src="https://apis.google.com/js/api.js"]',
			);
			if (existingScript) {
				resolve();
				return;
			}

			const script = document.createElement("script");
			script.src = "https://apis.google.com/js/api.js";
			script.async = true;
			script.defer = true;
			script.onload = () => resolve();
			script.onerror = () => reject(new Error("Failed to load Google API script"));
			document.head.appendChild(script);
		});
	}

	await pickerSdkPromise;

	if (!window.gapi?.load) {
		throw new Error("Google API client not available");
	}

	await new Promise<void>((resolve) => {
		window.gapi?.load("picker", () => resolve());
	});
};

export default function DriveFilePicker({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const [files, setFiles] = useState<DriveFileRow[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [isLaunchingPicker, setIsLaunchingPicker] = useState(false);
	const [isSelectingFromPicker, setIsSelectingFromPicker] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const addAttachedFile = useChatStore((s) => s.addAttachedFile);

	const fetchFiles = useCallback(async () => {
		setIsLoading(true);
		try {
			const response = await listDriveFiles({
				pageSize: 100,
				status: "INDEXED",
			});
			setFiles(response.items);
		} catch {
			setFiles([]);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		if (open) {
			void fetchFiles();
			setSelectedIds(new Set());
			setSearchQuery("");
		}
	}, [open, fetchFiles]);

	const filteredFiles = files.filter((file) =>
		file.name.toLowerCase().includes(searchQuery.toLowerCase()),
	);

	const toggleSelection = (fileId: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(fileId)) {
				next.delete(fileId);
			} else {
				next.add(fileId);
			}
			return next;
		});
	};

	const handleSelect = () => {
		for (const fileId of selectedIds) {
			const file = files.find((f) => f.id === fileId);
			if (file) {
				addAttachedFile(fileId, file.name);
			}
		}
		onClose();
	};

	const handleGooglePickerSelection = useCallback(
		async (googleFileIds: string[]) => {
			if (googleFileIds.length === 0) {
				return;
			}

			setIsSelectingFromPicker(true);
			try {
				const result = await pickerSelectDriveFiles(googleFileIds);

				for (const file of result.attachedFiles) {
					addAttachedFile(file.driveFileId, file.name);
				}

				if (result.rejectedFiles.length > 0) {
					toast.warning(
						`${result.rejectedFiles.length} selected file(s) were skipped (unsupported or unavailable).`,
					);
				}

				if (result.queuedCount > 0) {
					toast.success(
						`${result.attachedFiles.length} file(s) attached. ${result.queuedCount} queued for indexing.`,
					);
				} else {
					toast.success(`${result.attachedFiles.length} file(s) attached.`);
				}

				onClose();
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Unable to attach selected Google Drive files",
				);
			} finally {
				setIsSelectingFromPicker(false);
			}
		},
		[addAttachedFile, onClose],
	);

	const openGooglePicker = useCallback(async () => {
		setIsLaunchingPicker(true);
		try {
			if (!env.NEXT_PUBLIC_GOOGLE_API_KEY) {
				throw new Error("Missing NEXT_PUBLIC_GOOGLE_API_KEY configuration");
			}

			const tokenResult = await getDrivePickerToken();
			await loadGooglePickerSdk();

			const pickerApi = window.google?.picker;
			if (!pickerApi) {
				throw new Error("Google Picker is unavailable");
			}

			const docsView = new pickerApi.DocsView(pickerApi.ViewId.DOCS);
			docsView.setIncludeFolders(false);
			docsView.setSelectFolderEnabled(false);
			docsView.setMimeTypes(PICKER_SUPPORTED_MIME_TYPES);

			const picker = new pickerApi.PickerBuilder()
				.setOAuthToken(tokenResult.accessToken)
				.setDeveloperKey(env.NEXT_PUBLIC_GOOGLE_API_KEY)
				.enableFeature(pickerApi.Feature.MULTISELECT_ENABLED)
				.addView(docsView)
				.setCallback((response: GooglePickerResponse) => {
					const action = response[pickerApi.Response.ACTION];
					if (action !== pickerApi.Action.PICKED) {
						return;
					}

					const selectedDocs = (response[pickerApi.Response.DOCUMENTS] ??
						[]) as GooglePickerDocument[];
					const googleFileIds = selectedDocs
						.map((doc) => doc.id)
						.filter((id): id is string => typeof id === "string" && id.length > 0);

					void handleGooglePickerSelection(googleFileIds);
				})
				.build();

			picker.setVisible(true);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to open Google Drive picker. Use indexed file fallback below.",
			);
		} finally {
			setIsLaunchingPicker(false);
		}
	}, [handleGooglePickerSelection]);

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Select a file</DialogTitle>
					<div className="mt-2 border-b border-border pb-2">
						<span className="border-b-2 border-primary pb-2 text-xs font-medium">
							Google Drive
						</span>
					</div>
				</DialogHeader>

				<div className="flex items-center gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={() => {
							void openGooglePicker();
						}}
						disabled={isLaunchingPicker || isSelectingFromPicker}
						className="shrink-0"
					>
						{isLaunchingPicker ? <Loader2 className="size-4 animate-spin" /> : null}
						Browse Google Drive
					</Button>
					<div className="relative flex-1">
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Search files..."
							className="w-full rounded-sm border border-border bg-transparent py-1.5 pl-3 pr-8 text-xs outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
						/>
						<Search className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
					</div>
				</div>

				<p className="text-xs text-muted-foreground">
					Google Picker selection is preferred. The table below is a fallback for files already indexed.
				</p>

				<div className="max-h-[400px] overflow-y-auto">
					{isLoading || isSelectingFromPicker ? (
						<div className="flex items-center justify-center py-12">
							<Loader2 className="size-5 animate-spin text-muted-foreground" />
						</div>
					) : filteredFiles.length === 0 ? (
						<div className="py-12 text-center text-sm text-muted-foreground">
							{searchQuery ? "No files match your search" : "No indexed files found"}
						</div>
					) : (
						<table className="w-full">
							<thead>
								<tr className="border-b border-border text-left text-xs text-muted-foreground">
									<th className="w-8 pb-2" />
									<th className="pb-2 font-medium">Name</th>
									<th className="pb-2 font-medium">Status</th>
									<th className="pb-2 text-right font-medium">Last modified</th>
								</tr>
							</thead>
							<tbody>
								{filteredFiles.map((file) => (
									<tr
										key={file.id}
										onClick={() => toggleSelection(file.id)}
										className="cursor-pointer border-b border-border/50 hover:bg-muted/30 transition-colors"
									>
										<td className="py-2 pl-1">
											<input
												type="checkbox"
												checked={selectedIds.has(file.id)}
												onChange={() => toggleSelection(file.id)}
												className="size-3.5 rounded-sm accent-primary"
											/>
										</td>
										<td className="py-2">
											<div className="flex items-center gap-2 text-sm">
												<FileIcon mimeType={file.mimeType} />
												<span className="truncate">{file.name}</span>
											</div>
										</td>
										<td className="py-2">
											<span className="text-[10px] text-emerald-500">
												{file.indexStatus}
											</span>
										</td>
										<td className="py-2 text-right text-xs text-muted-foreground">
											{formatDate(file.modifiedAtGoogle || file.updatedAt)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button
						onClick={handleSelect}
						disabled={selectedIds.size === 0 || isLaunchingPicker || isSelectingFromPicker}
					>
						Select ({selectedIds.size})
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
