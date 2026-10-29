import type { CleanerCandidate } from "./contracts";

/** The bb thread fields that eligibility reads. */
export interface ThreadCleaner {
  id: string;
  title: string | null;
  titleFallback: string | null;
  projectId: string;
  updatedAt: number;
  pinnedAt: number | null;
  deletedAt: number | null;
  parentThreadId: string | null;
  lifecycleOwnerThreadId: string | null;
  visibility: string;
  status: string;
  runtime: { displayStatus: string };
  hasPendingInteraction: boolean;
  queuedWork: string;
  activity: Readonly<Record<string, number>>;
}

const STOPPED = ["idle", "error"];

/** Not deleted or pinned, last updated before `cutoff`, and with no running or pending work. */
export function isCleanable(thread: ThreadCleaner, cutoff: number): boolean {
  return (
    thread.deletedAt === null &&
    thread.pinnedAt === null &&
    thread.updatedAt < cutoff &&
    STOPPED.includes(thread.status) &&
    STOPPED.includes(thread.runtime.displayStatus) &&
    !thread.hasPendingInteraction &&
    thread.queuedWork === "none" &&
    Object.values(thread.activity).every((count) => count === 0)
  );
}

/** The roots and all their descendants, through either link, without looping on cycles. */
function descendantIds(
  threads: readonly ThreadCleaner[],
  roots: readonly string[],
): Set<string> {
  const children = new Map<string, Set<string>>();

  for (const thread of threads) {
    for (const parent of [
      thread.parentThreadId,
      thread.lifecycleOwnerThreadId,
    ]) {
      if (!parent) {
        continue;
      }

      const ids = children.get(parent) ?? new Set<string>();
      ids.add(thread.id);
      children.set(parent, ids);
    }
  }

  const seen = new Set<string>();
  const visit = [...roots];

  for (let id = visit.pop(); id !== undefined; id = visit.pop()) {
    if (seen.has(id)) {
      continue;
    }

    seen.add(id);
    visit.push(...(children.get(id) ?? []));
  }

  return seen;
}

/** `root` and every thread that bb deletes with it, through parent or lifecycle-owner links. */
export function deletionTree(
  threads: readonly ThreadCleaner[],
  root: string,
): ThreadCleaner[] {
  const byId = new Map(threads.map((thread) => [thread.id, thread]));

  return [...descendantIds(threads, [root])].flatMap((id) => {
    const thread = byId.get(id);

    return thread ? [thread] : [];
  });
}

export function threadTitle(
  thread: Pick<ThreadCleaner, "title" | "titleFallback">,
): string {
  return thread.title ?? thread.titleFallback ?? "Untitled thread";
}

/**
 * Visible threads whose whole deletion tree is cleanable. A pinned thread
 * protects every thread below it. A thread appears in at most one candidate.
 */
export function cleanerCandidates(
  threads: readonly ThreadCleaner[],
  cutoff: number,
): CleanerCandidate[] {
  const pinned = descendantIds(
    threads,
    threads.filter((thread) => thread.pinnedAt !== null).map(({ id }) => id),
  );
  const cleanable = (thread: ThreadCleaner) =>
    !pinned.has(thread.id) && isCleanable(thread, cutoff);
  const eligible = threads
    .filter((thread) => thread.visibility === "visible" && cleanable(thread))
    .map((thread) => ({ thread, members: deletionTree(threads, thread.id) }))
    .filter(({ members }) => members.every(cleanable));
  // Largest trees first: overlapping parent and lifecycle trees cannot both be offered.
  eligible.sort(
    (a, b) =>
      b.members.length - a.members.length ||
      a.thread.updatedAt - b.thread.updatedAt ||
      a.thread.id.localeCompare(b.thread.id),
  );
  const included = new Set<string>();
  const disjoint = eligible.filter(({ members }) => {
    if (members.some(({ id }) => included.has(id))) {
      return false;
    }

    for (const { id } of members) {
      included.add(id);
    }

    return true;
  });

  return disjoint.map(({ thread, members }) => ({
    id: thread.id,
    title: threadTitle(thread),
    updatedAt: thread.updatedAt,
    projectId: thread.projectId,
    members: members.map((member) => ({
      id: member.id,
      title: threadTitle(member),
      updatedAt: member.updatedAt,
    })),
  }));
}
