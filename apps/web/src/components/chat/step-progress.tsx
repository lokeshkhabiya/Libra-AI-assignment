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

import type { ObserveEntry, PlannedStep, StepEvent } from "@/lib/chat-store";
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

// ─── Planned Step (todo list item) ──────────────────────────────────────────

function PlannedStepItem({ step, index }: { step: PlannedStep; index: number }) {
	const Icon = (step.toolName && toolIcons[step.toolName]) || ChevronsRight;

	const statusIcon =
		step.status === "running" ? (
			<Loader2 className="size-3 shrink-0 animate-spin text-primary" />
		) : step.status === "complete" ? (
			<Check className="size-3 shrink-0 text-emerald-500" />
		) : step.status === "failed" ? (
			<X className="size-3 shrink-0 text-red-500" />
		) : (
			<div className="size-3 shrink-0 rounded-full border border-border" />
		);

	return (
		<div
			className={cn(
				"flex items-start gap-2 py-1 transition-opacity",
				step.status === "running" && "opacity-100",
				step.status === "pending" && "opacity-50",
				step.status === "complete" && "opacity-40",
			)}
		>
			<div className="mt-0.5 flex items-center gap-1.5">
				{statusIcon}
				<Icon className="size-3 shrink-0 text-muted-foreground" />
			</div>
			<span
				className={cn(
					"text-[11px] leading-snug",
					step.status === "running" ? "font-medium text-foreground" : "text-muted-foreground",
					step.status === "complete" && "line-through",
				)}
			>
				<span className="mr-1 text-muted-foreground/50">{index + 1}.</span>
				{step.description}
			</span>
		</div>
	);
}

// ─── Execution Log Step ──────────────────────────────────────────────────────

function ExecutionStepItem({ step }: { step: StepEvent }) {
	const [expanded, setExpanded] = useState(false);
	const Icon =
		(step.toolName && toolIcons[step.toolName]) ||
		(step.kind === "FINALIZE" ? FileSearch : ChevronsRight);

	const statusIcon =
		step.status === "running" ? (
			<Loader2 className="size-3 animate-spin text-primary" />
		) : step.status === "complete" ? (
			<Check className="size-3 text-emerald-500" />
		) : step.status === "failed" ? (
			<X className="size-3 text-red-500" />
		) : (
			<ChevronsRight className="size-3 text-muted-foreground" />
		);

	return (
		<div className="rounded-lg border border-border/40 bg-card/50">
			<button
				type="button"
				className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/30 rounded-lg"
				onClick={() => (step.input || step.output) && setExpanded((v) => !v)}
			>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2 text-xs">
						{statusIcon}
						<Icon className="size-3 shrink-0 text-muted-foreground" />
						<span className="line-clamp-1 text-foreground/90">{step.description}</span>
					</div>
					{step.summary && step.status !== "running" ? (
						<p className="mt-0.5 line-clamp-2 pl-[22px] text-[11px] text-muted-foreground">
							{step.summary}
						</p>
					) : null}
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{(step.input || step.output) ? (
						<ChevronDown
							className={cn(
								"size-3 text-muted-foreground transition-transform",
								expanded && "rotate-180",
							)}
						/>
					) : null}
				</div>
			</button>

			{expanded && (step.input || step.output) ? (
				<div className="space-y-2 border-t border-border/30 px-3 py-2.5">
					{step.input ? (
						<div>
							<p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
								Input
							</p>
							<pre className="overflow-x-auto rounded-lg border border-border/40 bg-muted/20 p-2.5 text-[10px] leading-relaxed text-foreground/70">
								{JSON.stringify(step.input, null, 2)}
							</pre>
						</div>
					) : null}
					{step.output ? (
						<div>
							<p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
								Output
							</p>
							<pre className="overflow-x-auto rounded-lg border border-border/40 bg-muted/20 p-2.5 text-[10px] leading-relaxed text-foreground/70">
								{JSON.stringify(step.output, null, 2)}
							</pre>
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}

// ─── Observe Entry ────────────────────────────────────────────────────────────

function ObserveEntryItem({ entry }: { entry: ObserveEntry }) {
	const actionColor =
		entry.action === "finalize"
			? "text-emerald-500"
			: entry.action === "replan"
				? "text-amber-500"
				: "text-primary";

	const actionLabel =
		entry.action === "finalize"
			? "Finalize"
			: entry.action === "replan"
				? "Replan"
				: "Continue";

	return (
		<div className="flex items-start gap-2 px-3 py-1.5">
			<div className="mt-1 size-1.5 shrink-0 rounded-full bg-muted-foreground/30" />
			<p className="text-[11px] leading-relaxed text-muted-foreground">
				<span className={cn("mr-1 font-semibold", actionColor)}>{actionLabel}:</span>
				{entry.reasoning}
				{entry.appendedSteps > 0 ? (
					<span className="ml-1 text-amber-500">
						(+{entry.appendedSteps} step{entry.appendedSteps === 1 ? "" : "s"} added)
					</span>
				) : null}
			</p>
		</div>
	);
}

// ─── Execution Plan (todo list) ───────────────────────────────────────────────

function ExecutionPlan({ plannedSteps }: { plannedSteps: PlannedStep[] }) {
	if (plannedSteps.length === 0) return null;

	return (
		<div className="rounded-xl border border-border/40 bg-muted/10 p-3">
			<p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
				Execution Plan
			</p>
			<div className="space-y-0.5">
				{plannedSteps.map((step, index) => (
					<PlannedStepItem key={step.planIndex} step={step} index={index} />
				))}
			</div>
		</div>
	);
}

// ─── Execution Log ────────────────────────────────────────────────────────────

function ExecutionLog({
	steps,
	observeLog,
}: {
	steps: StepEvent[];
	observeLog: ObserveEntry[];
}) {
	if (steps.length === 0) return null;

	// Interleave steps and observe entries: after step at index N, show observe[N]
	const items: Array<{ type: "step"; step: StepEvent } | { type: "observe"; entry: ObserveEntry }> = [];

	for (const step of steps) {
		items.push({ type: "step", step });
		// Find the observe entry whose planStepIndex matches how many steps we've added
		const stepIdx = items.filter((i) => i.type === "step").length - 1;
		const obs = observeLog.find((o) => o.planStepIndex === stepIdx);
		if (obs) {
			items.push({ type: "observe", entry: obs });
		}
	}

	return (
		<div>
			<p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
				Live Execution
			</p>
			<div className="space-y-1.5">
				{items.map((item, i) =>
					item.type === "step" ? (
						<ExecutionStepItem key={`step-${item.step.stepNumber}`} step={item.step} />
					) : (
						<ObserveEntryItem key={`obs-${i}`} entry={item.entry} />
					),
				)}
			</div>
		</div>
	);
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export type StepProgressProps = {
	plannedSteps: PlannedStep[];
	steps: StepEvent[];
	observeLog: ObserveEntry[];
	isComplete?: boolean;
};

export default function StepProgress({
	plannedSteps,
	steps,
	observeLog,
	isComplete = false,
}: StepProgressProps) {
	const [thinkingOpen, setThinkingOpen] = useState(false);

	const hasContent = plannedSteps.length > 0 || steps.length > 0;
	if (!hasContent) return null;

	const totalSteps = steps.length;

	// When task is complete, wrap everything in a collapsible "Thinking" toggle
	if (isComplete) {
		return (
			<div className="mb-4">
				<button
					type="button"
					onClick={() => setThinkingOpen((v) => !v)}
					className="flex items-center gap-2 rounded-lg px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
				>
					<ChevronDown
						className={cn("size-3.5 transition-transform", thinkingOpen && "rotate-180")}
					/>
					<span>
						Thinking ({totalSteps} step{totalSteps === 1 ? "" : "s"})
					</span>
				</button>

				{thinkingOpen ? (
					<div className="mt-2 space-y-3 rounded-xl border border-border/40 bg-muted/5 p-3 animate-fade-in-scale">
						<ExecutionPlan plannedSteps={plannedSteps} />
						<ExecutionLog steps={steps} observeLog={observeLog} />
					</div>
				) : null}
			</div>
		);
	}

	// During streaming: show both sections expanded
	return (
		<div className="mb-4 space-y-3">
			<ExecutionPlan plannedSteps={plannedSteps} />
			<ExecutionLog steps={steps} observeLog={observeLog} />
		</div>
	);
}
