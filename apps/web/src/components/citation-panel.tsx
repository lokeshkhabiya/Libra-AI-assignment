"use client";

import { FileText, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { getDriveFileContentUrl } from "@/lib/api/drive";
import { useChatStore } from "@/lib/chat-store";

export default function CitationPanel() {
	const activeCitationFileId = useChatStore((s) => s.activeCitationFileId);
	const setActiveCitation = useChatStore((s) => s.setActiveCitation);
	const [content, setContent] = useState<string | null>(null);
	const [contentType, setContentType] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [fileName, setFileName] = useState<string>("");

	useEffect(() => {
		if (!activeCitationFileId) return;

		setIsLoading(true);
		setContent(null);
		setContentType(null);

		const url = getDriveFileContentUrl(activeCitationFileId);
		let objectUrl: string | null = null;
		let cancelled = false;

		void (async () => {
			try {
				const response = await fetch(url, { credentials: "include" });
				if (!response.ok) {
					throw new Error("Unable to fetch file content");
				}
				const type = response.headers.get("content-type") || "";
				if (cancelled) {
					return;
				}
				setContentType(type);

				const disposition = response.headers.get("content-disposition") || "";
				const match = disposition.match(/filename="([^"]+)"/);
				setFileName(match?.[1] || "Document");

				if (type.includes("application/pdf")) {
					const blob = await response.blob();
					if (cancelled) {
						return;
					}
					objectUrl = URL.createObjectURL(blob);
					setContent(objectUrl);
				} else {
					const text = await response.text();
					if (cancelled) {
						return;
					}
					setContent(text);
				}
			} catch {
				if (cancelled) {
					return;
				}
				setContent("Failed to load document content.");
				setContentType("text/plain");
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		})();

		return () => {
			cancelled = true;
			if (objectUrl) {
				URL.revokeObjectURL(objectUrl);
			}
		};
	}, [activeCitationFileId]);

	if (!activeCitationFileId) return null;

	return (
		<div className="flex w-[440px] shrink-0 flex-col border-l border-border bg-card">
			<div className="flex items-center justify-between border-b border-border px-4 py-3">
				<div className="flex items-center gap-2 min-w-0">
					<FileText className="size-4 shrink-0 text-muted-foreground" />
					<span className="truncate text-sm font-medium">{fileName || "Document"}</span>
				</div>
				<Button
					variant="ghost"
					size="icon-sm"
					onClick={() => setActiveCitation(null)}
				>
					<X className="size-4" />
				</Button>
			</div>
			<div className="flex-1 overflow-auto">
				{isLoading ? (
					<div className="flex items-center justify-center py-20">
						<Loader2 className="size-5 animate-spin text-muted-foreground" />
					</div>
				) : contentType?.includes("application/pdf") && content ? (
					<iframe
						src={content}
						title={fileName}
						className="h-full w-full"
					/>
				) : content ? (
					<pre className="whitespace-pre-wrap p-4 text-xs leading-relaxed text-foreground/80">
						{content}
					</pre>
				) : null}
			</div>
		</div>
	);
}
