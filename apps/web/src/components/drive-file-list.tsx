"use client";

import type { DriveFileRow } from "@/lib/api/drive";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

const statusClassName: Record<DriveFileRow["indexStatus"], string> = {
	PENDING: "bg-amber-100 text-amber-900",
	INDEXED: "bg-emerald-100 text-emerald-900",
	FAILED: "bg-red-100 text-red-900",
	SKIPPED: "bg-zinc-200 text-zinc-800",
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
			<Card>
				<CardHeader>
					<CardTitle>No indexed files yet</CardTitle>
					<CardDescription>
						Connect Drive and trigger sync to ingest Docs, PDFs, and text files.
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Indexed Files</CardTitle>
				<CardDescription>
					Latest Drive files and ingestion state in your personal vector namespace.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="overflow-x-auto">
					<table className="min-w-full border-collapse text-left text-xs">
						<thead>
							<tr className="border-b border-border/80 text-muted-foreground">
								<th className="px-2 py-2 font-medium">File</th>
								<th className="px-2 py-2 font-medium">Status</th>
								<th className="px-2 py-2 font-medium">Chunks</th>
								<th className="px-2 py-2 font-medium">Updated</th>
							</tr>
						</thead>
						<tbody>
							{files.map((file) => {
								return (
									<tr key={file.id} className="border-b border-border/60">
										<td className="px-2 py-2 align-top">
											<div className="max-w-[26rem]">
												{file.webViewLink ? (
													<a
														href={file.webViewLink}
														target="_blank"
														rel="noreferrer"
														className="font-medium underline decoration-dotted underline-offset-2"
													>
														{file.name}
													</a>
												) : (
													<p className="font-medium">{file.name}</p>
												)}
												<p className="mt-1 text-muted-foreground">{file.mimeType}</p>
												{file.indexError ? (
													<p className="mt-1 text-destructive">{file.indexError}</p>
												) : null}
											</div>
										</td>
										<td className="px-2 py-2 align-top">
											<span
												className={`inline-flex rounded-none px-2 py-1 text-[10px] font-semibold ${statusClassName[file.indexStatus]}`}
											>
												{file.indexStatus}
											</span>
										</td>
										<td className="px-2 py-2 align-top">{file.chunkCount}</td>
										<td className="px-2 py-2 align-top text-muted-foreground">
											{formatDate(file.updatedAt)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</CardContent>
		</Card>
	);
}
