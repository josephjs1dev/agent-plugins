/**
 * Render-only derivations for the Podium Context tab: the accepted plan line,
 * write scope the Conductor grew through later revisions, and the loop
 * context's reopen lines. Pure data with no view imports, like history.ts.
 */
import type {
  LoopReopen,
  StoredSymphony,
  SymphonyContext,
} from "../symphonies/models";
import { shortTimestamp, taskCountLabel } from "./labels";

/** The server stores the goal, cut to 4000 characters, as the outcome. */
const OUTCOME_LIMIT = 4000;

/**
 * The expected outcome when it says more than the goal, else null: a symphony
 * started without one stores its trimmed goal in its place.
 */
export function distinctExpectedOutcome(
  context: Pick<SymphonyContext, "plan" | "expectedOutcome">,
): string | null {
  return context.expectedOutcome !== context.plan.slice(0, OUTCOME_LIMIT).trim()
    ? context.expectedOutcome
    : null;
}

/**
 * The accepted plan as one line: when the first revision was accepted, its
 * reason, and the task count. Null before any revision was accepted.
 */
export function planAcceptedLine(symphony: StoredSymphony): string | null {
  const first = symphony.revisions[0];
  if (!first) {
    return null;
  }
  return `Plan accepted ${shortTimestamp(first.acceptedAt)} · ${first.reason} · ${taskCountLabel(first.score.tasks.length)}`;
}

/**
 * Tasks whose write scope a later revision grew. Older symphonies grew scope
 * through a new revision, so History cannot attribute those paths to one
 * attempt and the Context tab names the tasks instead.
 */
export function writeScopeGrownTasks(symphony: StoredSymphony): string[] {
  const first = symphony.revisions[0];
  const latest = symphony.revisions.at(-1);
  if (!first || !latest) {
    return [];
  }
  return latest.score.tasks.flatMap((task) => {
    const original = first.score.tasks.find((entry) => entry.id === task.id);
    return original &&
      task.writes.some((path) => !original.writes.includes(path))
      ? [task.id]
      : [];
  });
}

/**
 * The findings a reopened task must fix, one line each: the resolved findings
 * as "id: summary" when recorded, else the stored finding lines.
 */
export function reopenFindingLines(reopen: LoopReopen): readonly string[] {
  return reopen.resolved?.length
    ? reopen.resolved.map((finding) => `${finding.id}: ${finding.summary}`)
    : reopen.findings;
}
