"use client";

import { FileText, Folder, Loader2, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { type DriveFileRow, listDriveFiles } from "@/lib/api/drive";
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

export default function DriveFilePicker({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const [files, setFiles] = useState<DriveFileRow[]>([]);
	const [isLoading, setIsLoading] = useState(false);
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

				<div className="max-h-[400px] overflow-y-auto">
					{isLoading ? (
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
					<Button onClick={handleSelect} disabled={selectedIds.size === 0}>
						Select ({selectedIds.size})
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
