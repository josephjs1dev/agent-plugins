import { z } from "zod";

/** The largest tree that one cleanup reads. */
export const MAX_CHILD_THREADS = 500;
const MESSAGE_MAX = 500;

export const cleanupActionSchema = z.enum(["archive", "delete"]);
export type CleanupAction = z.infer<typeof cleanupActionSchema>;

/** One thread below the root, with the fields cleanup reads. */
export interface ChildThread {
  id: string;
  parentId: string;
  title: string;
  /** bb's execution status. Only "idle" counts as idle. */
  status: string;
  archived: boolean;
  /** Plugin-internal threads that bb hides from its thread list. */
  hidden: boolean;
  /** Background agents, commands, and workflows still running. */
  backgroundWork: number;
  /** A message waits behind the current turn. */
  queuedWork: boolean;
  /** The agent waits for the user: an approval or a question. */
  pendingInteraction: boolean;
}

const threadIdSchema = z.string().min(1).max(256);
const countSchema = z.int().min(0);

export const targetSchema = z.object({
  id: threadIdSchema,
  title: z.string().max(400),
  archived: z.boolean(),
});
export type Target = z.infer<typeof targetSchema>;

export const cleanupPlanSchema = z.object({
  action: cleanupActionSchema,
  /** Deepest first, so a thread goes before its parent. */
  targets: z.array(targetSchema).max(MAX_CHILD_THREADS),
  /** Visible child threads that run, queue work, or wait for the user. */
  busy: countSchema,
  /** Idle child threads that stay because a thread below them is busy. */
  blocked: countSchema,
});
export type CleanupPlan = z.infer<typeof cleanupPlanSchema>;

export const cleanupResultSchema = z.object({
  action: cleanupActionSchema,
  done: z.array(targetSchema).max(MAX_CHILD_THREADS),
  failed: z
    .array(targetSchema.extend({ message: z.string().max(MESSAGE_MAX) }))
    .max(MAX_CHILD_THREADS),
  /** Confirmed threads that were no longer eligible when the cleanup ran. */
  skipped: countSchema,
  busy: countSchema,
  blocked: countSchema,
});
export type CleanupResult = z.infer<typeof cleanupResultSchema>;

export const planInputSchema = z
  .object({ threadId: threadIdSchema, action: cleanupActionSchema })
  .strict();

export const runInputSchema = planInputSchema
  .extend({
    /** The targets the user confirmed, from an earlier plan. */
    threadIds: z.array(threadIdSchema).min(1).max(MAX_CHILD_THREADS),
  })
  .strict();

/**
 * Idle means no turn, no background work, no queued message, and no open
 * question. Any other state keeps the thread and every thread above it.
 */
export function isIdle(thread: ChildThread): boolean {
  return (
    thread.status === "idle" &&
    thread.backgroundWork === 0 &&
    !thread.queuedWork &&
    !thread.pendingInteraction
  );
}

/**
 * Selects the visible idle child threads with no busy thread below them.
 * `threads` is breadth first: a parent before its children. Archive skips
 * threads that are already archived. Delete includes them. Hidden threads
 * are never targets, but a busy hidden thread still keeps every thread above
 * it.
 */
export function planCleanup(
  threads: readonly ChildThread[],
  action: CleanupAction,
): CleanupPlan {
  const children = new Map<string, ChildThread[]>();
  for (const thread of threads) {
    const siblings = children.get(thread.parentId) ?? [];
    siblings.push(thread);
    children.set(thread.parentId, siblings);
  }

  // Breadth-first order reversed puts every child before its parent.
  const deepestFirst = [...threads].reverse();
  const busyBelow = new Set<string>();
  for (const thread of deepestFirst) {
    const below = children.get(thread.id) ?? [];
    if (below.some((child) => !isIdle(child) || busyBelow.has(child.id))) {
      busyBelow.add(thread.id);
    }
  }

  const candidates = deepestFirst.filter(
    (thread) =>
      !thread.hidden &&
      isIdle(thread) &&
      (action === "delete" || !thread.archived),
  );
  return {
    action,
    targets: candidates
      .filter((thread) => !busyBelow.has(thread.id))
      .map(({ id, title, archived }) => ({ id, title, archived })),
    busy: threads.filter((thread) => !thread.hidden && !isIdle(thread)).length,
    blocked: candidates.filter((thread) => busyBelow.has(thread.id)).length,
  };
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function stays(n: number): string {
  return n === 1 ? "stays" : "stay";
}

/** One line for a confirmation prompt. */
export function describePlan(plan: CleanupPlan): string {
  const parts = [
    plan.targets.length
      ? `${count(plan.targets.length, "idle child thread")} to ${plan.action}.`
      : `No idle child threads to ${plan.action}.`,
  ];
  if (plan.busy) {
    parts.push(`${count(plan.busy, "busy child thread")} ${stays(plan.busy)}.`);
  }
  if (plan.blocked) {
    parts.push(
      `${count(plan.blocked, "idle child thread")} above busy work ${stays(plan.blocked)}.`,
    );
  }
  return parts.join(" ");
}

/** One line for a toast. */
export function describeResult(result: CleanupResult): string {
  const verb = result.action === "archive" ? "Archived" : "Deleted";
  const parts = [`${verb} ${count(result.done.length, "child thread")}.`];
  if (result.failed.length) {
    parts.push(`${count(result.failed.length, "child thread")} failed.`);
  }
  if (result.skipped) {
    parts.push(
      `${count(result.skipped, "child thread")} changed since the check and ${stays(result.skipped)}.`,
    );
  }
  if (result.busy) {
    parts.push(
      `${count(result.busy, "busy child thread")} ${stays(result.busy)}.`,
    );
  }
  return parts.join(" ");
}
