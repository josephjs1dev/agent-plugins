import {
  SYMPHONY_LIMITS,
  latestAttempt,
  type StoredSymphony,
} from "../symphonies/models";
import type { SymphonyMetrics } from "../symphonies/metrics";
import { currentLoop } from "../symphonies/score";
import { taskState } from "../symphonies/task-state";
import { formatDuration, tokenTotalsLabel, workTotalsLabel } from "./labels";
import type { SymphonyProgressSegment } from "./progress";

/** The symphony detail tabs, in tab order. */
export const DETAIL_VIEWS = ["tasks", "graph", "context", "history"] as const;
export type DetailView = (typeof DETAIL_VIEWS)[number];

/** Each detail tab's Lucide icon; each host maps it to its icons. */
export const DETAIL_VIEW_ICONS: Record<DetailView, string> = {
  tasks: "ListChecks",
  graph: "GitBranch",
  context: "FileText",
  history: "History",
};

/** A detail tab's visible label, such as "Tasks". */
export function detailViewLabel(view: DetailView): string {
  return view.charAt(0).toUpperCase() + view.slice(1);
}

/**
 * The header's reported completion. A slice fills only when that task's
 * latest attempt reported complete, in score order. A settling agent still
 * reports complete, so the header agrees with the list's count.
 */
export function detailProgress(symphony: StoredSymphony): {
  completed: number;
  taskCount: number;
  segments: SymphonyProgressSegment[];
} {
  const tasks = symphony.revisions.at(-1)?.score.tasks ?? [];
  const segments = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    state: taskState(symphony, task).key,
    reportedComplete: latestAttempt(symphony, task.id)?.state === "completed",
  }));
  return {
    completed: segments.filter((segment) => segment.reportedComplete).length,
    taskCount: tasks.length,
    segments,
  };
}

/** The result card's attribution heading. */
export function resultLabel(symphony: StoredSymphony): string {
  return symphony.execution.origin === "conducted"
    ? "RESULT · REPORTED BY THE CONDUCTOR AGENT"
    : "RESULT · REPORTED BY THE SOURCE AGENT";
}

/**
 * A conducted symphony's loop against the budget chosen at `orchestrate`,
 * such as " · Loop 2 of 3"; records without one use the default budget.
 * Planning and unconducted symphonies have no note.
 */
export function loopNote(symphony: StoredSymphony): string {
  const conducting = symphony.execution.conducting;
  if (!conducting || conducting.phase === "planning") {
    return "";
  }
  const budget = conducting.maxLoops ?? SYMPHONY_LIMITS.defaultLoops;
  return ` · Loop ${currentLoop(symphony)} of ${budget}`;
}

/**
 * Whole-symphony figures: elapsed time, summed work, blocked time when any,
 * and tokens, such as "12m elapsed · 9m work · 1.2k in · 300 out".
 */
export function metricsLine(metrics: SymphonyMetrics): string {
  return [
    `${formatDuration(metrics.elapsedMs)} elapsed`,
    workTotalsLabel(metrics),
    ...(metrics.blockedMs > 0
      ? [`${formatDuration(metrics.blockedMs)} blocked`]
      : []),
    tokenTotalsLabel(metrics.tokens),
  ].join(" · ");
}
