"use client";

import { ExternalLink, FileText } from "lucide-react";

import type { TaskCitation } from "@/lib/api/agent";
import { useChatStore } from "@/lib/chat-store";

export default function CitationList({ citations }: { citations: TaskCitation[] }) {
	const setActiveCitation = useChatStore((s) => s.setActiveCitation);

	if (!citations || citations.length === 0) return null;

	return (
		<div className="mt-3 flex flex-wrap gap-1.5">
			{citations.map((citation, index) => {
				const isWeb = citation.sourceType === "WEB";
				const isDrive = citation.sourceType === "DRIVE";

				return (
					<button
						key={citation.id || index}
						type="button"
						className="inline-flex items-center gap-1 rounded-sm border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
					onClick={() => {
						if (isWeb && citation.sourceUrl) {
							window.open(citation.sourceUrl, "_blank", "noopener");
						} else if (isDrive && citation.driveFileId) {
							const mimeType =
								citation.metadata && typeof citation.metadata["mimeType"] === "string"
									? citation.metadata["mimeType"]
									: null;
							setActiveCitation(citation.driveFileId, mimeType);
						}
					}}
				>
						{isWeb ? <ExternalLink className="size-2.5" /> : <FileText className="size-2.5" />}
						<span className="max-w-[200px] truncate">
							[{index + 1}] {citation.title || "Source"}
						</span>
					</button>
				);
			})}
		</div>
	);
}
