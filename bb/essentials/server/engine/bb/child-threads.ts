import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  MAX_CHILD_THREADS,
  planCleanup,
  type ChildThread,
  type CleanupAction,
  type CleanupResult,
  type Target,
} from "../../../shared/child-threads";

type Sdk = BbPluginApi["sdk"];
type Thread = Awaited<ReturnType<Sdk["threads"]["list"]>>[number];

const CONCURRENCY = 8;
const MESSAGE_MAX = 500;

export function childThread(thread: Thread, parentId: string): ChildThread {
  const { activity } = thread;
  return {
    id: thread.id,
    parentId,
    title: (thread.title ?? thread.titleFallback ?? thread.id).slice(0, 400),
    status: thread.status,
    archived: thread.archivedAt !== null,
    hidden: thread.visibility === "hidden",
    backgroundWork:
      activity.activeBackgroundAgentCount +
      activity.activeBackgroundCommandCount +
      activity.activeWorkflowCount,
    queuedWork: thread.queuedWork === "waiting",
    pendingInteraction: thread.hasPendingInteraction,
  };
}

/**
 * Every thread below `rootId`, breadth first: a parent before its children.
 * bb lists a parent's archived and unarchived children together.
 */
export async function readChildThreads(
  sdk: Sdk,
  rootId: string,
): Promise<ChildThread[]> {
  const threads: ChildThread[] = [];
  const seen = new Set([rootId]);
  let level = [rootId];
  while (level.length) {
    const next: string[] = [];
    for (let start = 0; start < level.length; start += CONCURRENCY) {
      const parents = level.slice(start, start + CONCURRENCY);
      const lists = await Promise.all(
        parents.map(async (parentId) => ({
          parentId,
          children: await sdk.threads.list({
            parentThreadId: parentId,
            includeHidden: true,
          }),
        })),
      );
      for (const { parentId, children } of lists) {
        for (const thread of children) {
          if (seen.has(thread.id)) {
            continue;
          }
          seen.add(thread.id);
          threads.push(childThread(thread, parentId));
          next.push(thread.id);
        }
      }
      if (threads.length > MAX_CHILD_THREADS) {
        throw new Error(
          `This thread has more than ${MAX_CHILD_THREADS} child threads. Clean up one of its child threads first.`,
        );
      }
    }
    level = next;
  }
  return threads;
}

export interface CleanupRequest {
  rootId: string;
  action: CleanupAction;
  /** The confirmed targets. Others stay, even when they are eligible now. */
  threadIds: readonly string[];
}

function errorMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  return message.slice(0, MESSAGE_MAX);
}

/**
 * Plans again, then acts on the confirmed targets that are still eligible,
 * one at a time and deepest first. bb archives and deletes a thread together
 * with the threads whose lifecycle it owns, so every ancestor of a failed
 * thread stays.
 */
export async function runCleanup(
  sdk: Sdk,
  { rootId, action, threadIds }: CleanupRequest,
): Promise<CleanupResult> {
  const threads = await readChildThreads(sdk, rootId);
  const plan = planCleanup(threads, action);
  const parents = new Map(
    threads.map((thread) => [thread.id, thread.parentId]),
  );
  const confirmed = new Set(threadIds);
  const chosen = plan.targets.filter((target) => confirmed.has(target.id));
  const held = new Set<string>();
  const done: Target[] = [];
  const failed: CleanupResult["failed"] = [];
  for (const target of chosen) {
    if (held.has(target.id)) {
      failed.push({ ...target, message: "A child thread below it failed." });
      continue;
    }
    try {
      if (action === "archive") {
        await sdk.threads.archive({ threadId: target.id });
      } else {
        await sdk.threads.delete({
          threadId: target.id,
          childThreadsConfirmed: true,
        });
      }
      done.push(target);
    } catch (cause) {
      failed.push({ ...target, message: errorMessage(cause) });
      for (let up = parents.get(target.id); up; up = parents.get(up)) {
        held.add(up);
      }
    }
  }
  return {
    action,
    done,
    failed,
    skipped: confirmed.size - chosen.length,
    busy: plan.busy,
    blocked: plan.blocked,
  };
}
