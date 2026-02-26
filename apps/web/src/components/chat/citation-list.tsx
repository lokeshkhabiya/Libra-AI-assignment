"use client";

import { ExternalLink, FileText } from "lucide-react";

import type { TaskCitation } from "@/lib/api/agent";
import { useChatStore } from "@/lib/chat-store";

export default function CitationList({ citations }: { citations: TaskCitation[] }) {
	const setActiveCitation = useChatStore((s) => s.setActiveCitation);

	if (!citations || citations.length === 0) return null;

	return (
		<div className="mt-4 flex flex-wrap gap-2">
			{citations.map((citation, index) => {
				const isWeb = citation.sourceType === "WEB";
				const isDrive = citation.sourceType === "DRIVE";

				return (
					<button
						key={citation.id || index}
						type="button"
						className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
						{isWeb ? <ExternalLink className="size-3" /> : <FileText className="size-3" />}
						<span className="max-w-[200px] truncate">
							[{index + 1}] {citation.title || "Source"}
						</span>
					</button>
				);
			})}
		</div>
	);
}
