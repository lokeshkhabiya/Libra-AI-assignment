"use client";

import { ChevronLeft, ChevronRight, FileText, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { getDriveFileContentUrl } from "@/lib/api/drive";
import { useChatStore } from "@/lib/chat-store";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

function PdfViewer({ url }: { url: string }) {
	const [numPages, setNumPages] = useState<number>(0);
	const [pageNumber, setPageNumber] = useState(1);
	const containerRef = useRef<HTMLDivElement>(null);
	const [containerWidth, setContainerWidth] = useState<number>(500);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry) {
				setContainerWidth(entry.contentRect.width);
			}
		});
		observer.observe(el);
		setContainerWidth(el.clientWidth);
		return () => observer.disconnect();
	}, []);

	return (
		<div ref={containerRef} className="flex flex-col h-full">
			<div className="flex-1 overflow-y-auto">
				<Document
					file={url}
					onLoadSuccess={({ numPages: n }) => {
						setNumPages(n);
						setPageNumber(1);
					}}
					loading={
						<div className="flex items-center justify-center py-20">
							<Loader2 className="size-5 animate-spin text-muted-foreground" />
						</div>
					}
					error={
						<div className="p-4 text-xs text-red-500">Failed to load PDF.</div>
					}
				>
					<Page
						pageNumber={pageNumber}
						width={containerWidth - 32}
						className="mx-auto"
					/>
				</Document>
			</div>

			{numPages > 0 && (
				<div className="flex items-center justify-center gap-3 border-t border-border/40 px-4 py-2.5">
					<Button
						variant="ghost"
						size="icon-sm"
						className="rounded-full"
						onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
						disabled={pageNumber <= 1}
					>
						<ChevronLeft className="size-4" />
					</Button>
					<span className="text-xs tabular-nums text-muted-foreground">
						{pageNumber} / {numPages}
					</span>
					<Button
						variant="ghost"
						size="icon-sm"
						className="rounded-full"
						onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
						disabled={pageNumber >= numPages}
					>
						<ChevronRight className="size-4" />
					</Button>
				</div>
			)}
		</div>
	);
}

export default function CitationPanel() {
	const activeCitationFileId = useChatStore((s) => s.activeCitationFileId);
	const setActiveCitation = useChatStore((s) => s.setActiveCitation);
	const [content, setContent] = useState<string | null>(null);
	const [contentType, setContentType] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [fileName, setFileName] = useState<string>("");

	const isOpen = !!activeCitationFileId;

	useEffect(() => {
		if (!activeCitationFileId) {
			setContent(null);
			setContentType(null);
			setFileName("");
			return;
		}

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
				if (cancelled) return;
				setContentType(type);

				const disposition = response.headers.get("content-disposition") || "";
				const match = disposition.match(/filename="([^"]+)"/);
				setFileName(match?.[1] || "Document");

				if (type.includes("application/pdf")) {
					const blob = await response.blob();
					if (cancelled) return;
					objectUrl = URL.createObjectURL(blob);
					setContent(objectUrl);
				} else {
					const text = await response.text();
					if (cancelled) return;
					setContent(text);
				}
			} catch {
				if (cancelled) return;
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

	return (
		<Sheet
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) setActiveCitation(null);
			}}
		>
			<SheetContent
				side="right"
				showCloseButton={true}
				className="flex flex-col p-0 sm:w-[40vw] sm:max-w-[40vw] *:data-[slot=sheet-close]:top-3 *:data-[slot=sheet-close]:right-3"
			>
				<SheetHeader className="border-b border-border/40 px-4 py-3">
					<div className="flex items-center gap-2.5 min-w-0 pr-8">
						<div className="flex size-7 items-center justify-center rounded-lg bg-muted/50">
							<FileText className="size-3.5 text-muted-foreground" />
						</div>
						<SheetTitle className="truncate text-sm font-medium">
							{fileName || "Document"}
						</SheetTitle>
					</div>
				</SheetHeader>

				<div className="flex-1 overflow-hidden">
					{isLoading ? (
						<div className="flex h-full items-center justify-center animate-fade-in">
							<Loader2 className="size-5 animate-spin text-muted-foreground" />
						</div>
					) : contentType?.includes("application/pdf") && content ? (
						<PdfViewer url={content} />
					) : content ? (
						<div className="h-full overflow-y-auto">
							<pre className="whitespace-pre-wrap p-5 text-xs leading-relaxed text-foreground/80">
								{content}
							</pre>
						</div>
					) : null}
				</div>
			</SheetContent>
		</Sheet>
	);
}
