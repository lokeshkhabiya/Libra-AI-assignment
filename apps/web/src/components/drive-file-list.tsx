"use client";

import type { DriveFileRow } from "@/lib/api/drive";
import { cn } from "@/lib/utils";

const statusStyle: Record<DriveFileRow["indexStatus"], string> = {
	PENDING: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
	INDEXED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	FAILED: "bg-red-500/10 text-red-600 dark:text-red-400",
	SKIPPED: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
};

const formatDate = (value: string | null): string => {
	if (!value) {
		return "-";
	}

	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return "-";
	}

	return parsed.toLocaleString();
};

export default function DriveFileList({ files }: { files: DriveFileRow[] }) {
	if (files.length === 0) {
		return (
			<div className="rounded-xl border border-dashed border-border/50 px-6 py-10 text-center">
				<p className="text-sm font-medium text-foreground/70">No indexed files yet</p>
				<p className="mt-1 text-xs text-muted-foreground">
					Connect Drive and trigger sync to ingest Docs, PDFs, and text files.
				</p>
			</div>
		);
	}

	return (
		<div>
			<h2 className="mb-3 text-sm font-semibold tracking-tight">Indexed Files</h2>
			<div className="overflow-hidden rounded-xl border border-border/50">
				<div className="max-h-[400px] overflow-x-auto overflow-y-auto">
					<table className="min-w-full text-left text-xs">
						<thead>
							<tr className="border-b border-border/50 bg-muted/30">
								<th className="px-4 py-2.5 font-medium text-muted-foreground">File</th>
								<th className="px-4 py-2.5 font-medium text-muted-foreground">Status</th>
								<th className="px-4 py-2.5 font-medium text-muted-foreground">Chunks</th>
								<th className="px-4 py-2.5 font-medium text-muted-foreground">Updated</th>
							</tr>
						</thead>
						<tbody>
							{files.map((file, index) => {
								return (
									<tr
										key={file.id}
										className={cn(
											"border-b border-border/30 transition-colors hover:bg-muted/20",
											index === files.length - 1 && "border-b-0"
										)}
									>
										<td className="px-4 py-3 align-top">
											<div className="max-w-[26rem]">
												{file.webViewLink ? (
													<a
														href={file.webViewLink}
														target="_blank"
														rel="noreferrer"
														className="font-medium text-foreground hover:text-primary transition-colors"
													>
														{file.name}
													</a>
												) : (
													<p className="font-medium">{file.name}</p>
												)}
												<p className="mt-0.5 text-[11px] text-muted-foreground">{file.mimeType}</p>
												{file.indexError ? (
													<p className="mt-0.5 text-[11px] text-destructive">{file.indexError}</p>
												) : null}
											</div>
										</td>
										<td className="px-4 py-3 align-top">
											<span
												className={cn(
													"inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
													statusStyle[file.indexStatus],
												)}
											>
												{file.indexStatus}
											</span>
										</td>
										<td className="px-4 py-3 align-top tabular-nums">{file.chunkCount}</td>
										<td className="px-4 py-3 align-top text-muted-foreground">
											{formatDate(file.updatedAt)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
