"use client";

import {
	Check,
	ChevronDown,
	ChevronsRight,
	Database,
	FileSearch,
	Globe,
	HardDrive,
	Loader2,
	Search,
	X,
} from "lucide-react";
import { useState } from "react";

import type { StepEvent } from "@/lib/chat-store";
import { cn } from "@/lib/utils";

const toolIcons: Record<string, typeof Search> = {
	web_search: Search,
	web_scrape: Globe,
	drive_retrieve: HardDrive,
	vector_search: Database,
	WEB_SEARCH: Search,
	WEB_SCRAPE: Globe,
	DRIVE_RETRIEVE: HardDrive,
	VECTOR_SEARCH: Database,
};

const statusChipClassName: Record<StepEvent["status"], string> = {
	pending: "bg-zinc-200 text-zinc-800",
	running: "bg-blue-100 text-blue-900",
	complete: "bg-emerald-100 text-emerald-900",
	failed: "bg-red-100 text-red-900",
};

const statusLabel: Record<StepEvent["status"], string> = {
	pending: "PENDING",
	running: "RUNNING",
	complete: "DONE",
	failed: "FAILED",
};

function StepItem({ step }: { step: StepEvent }) {
	const [expanded, setExpanded] = useState(false);
	const Icon =
		(step.toolName && toolIcons[step.toolName]) || (step.kind === "FINALIZE"
			? FileSearch
			: ChevronsRight);

	const statusIcon =
		step.status === "running" ? (
			<Loader2 className="size-3 animate-spin text-muted-foreground" />
		) : step.status === "complete" ? (
			<Check className="size-3 text-emerald-600" />
		) : step.status === "failed" ? (
			<X className="size-3 text-red-600" />
		) : (
			<ChevronsRight className="size-3 text-zinc-500" />
		);

	return (
		<div className="rounded-none border border-border/70 bg-card">
			<button
				type="button"
				className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left"
				onClick={() => setExpanded((value) => !value)}
			>
				<div className="min-w-0">
					<div className="flex items-center gap-1.5 text-xs">
						{statusIcon}
						<Icon className="size-3 shrink-0 text-muted-foreground" />
						<span className="line-clamp-1 text-foreground">{step.description}</span>
					</div>
					{step.summary ? (
						<p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
							{step.summary}
						</p>
					) : null}
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<span
						className={cn(
							"inline-flex rounded-none px-1.5 py-0.5 text-[10px] font-semibold",
							statusChipClassName[step.status],
						)}
					>
						{statusLabel[step.status]}
					</span>
					<ChevronDown
						className={cn("size-3 text-muted-foreground transition-transform", expanded && "rotate-180")}
					/>
				</div>
			</button>

			{expanded && (step.input || step.output) ? (
				<div className="space-y-2 border-t border-border/70 px-2.5 py-2">
					{step.input ? (
						<div>
							<p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
								Input
							</p>
							<pre className="overflow-x-auto rounded-none border border-border/70 bg-muted/30 p-2 text-[10px] leading-relaxed text-foreground/80">
								{JSON.stringify(step.input, null, 2)}
							</pre>
						</div>
					) : null}
					{step.output ? (
						<div>
							<p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
								Output
							</p>
							<pre className="overflow-x-auto rounded-none border border-border/70 bg-muted/30 p-2 text-[10px] leading-relaxed text-foreground/80">
								{JSON.stringify(step.output, null, 2)}
							</pre>
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}

export default function StepProgress({ steps }: { steps: StepEvent[] }) {
	const [expanded, setExpanded] = useState(false);

	if (steps.length === 0) return null;

	const pendingCount = steps.filter((step) => step.status === "pending").length;
	const runningCount = steps.filter((step) => step.status === "running").length;
	const completedCount = steps.filter((step) => step.status === "complete").length;

	const statusLabelText =
		runningCount > 0
			? `Running ${runningCount} step${runningCount === 1 ? "" : "s"}`
			: pendingCount > 0
				? `${pendingCount} pending`
				: `${completedCount}/${steps.length} completed`;

	return (
		<div className="mb-3 rounded-none border border-border/70 bg-muted/20 p-2">
			<button
				type="button"
				onClick={() => setExpanded((value) => !value)}
				className="flex w-full items-center justify-between gap-2 text-left"
			>
				<div className="flex items-center gap-1.5">
					<ChevronDown
						className={cn("size-3 transition-transform", expanded && "rotate-180")}
					/>
					<span className="text-xs font-medium text-foreground">Execution Timeline</span>
				</div>
				<span className="text-[11px] text-muted-foreground">{statusLabelText}</span>
			</button>
			{expanded ? (
				<div className="mt-2 space-y-1.5">
					{steps.map((step) => (
						<StepItem key={`${step.stepNumber}-${step.kind}`} step={step} />
					))}
				</div>
			) : null}
		</div>
	);
}
