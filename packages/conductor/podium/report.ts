import type { StatusColor } from "./status";
import {
  type FailureNeed,
  type TaskFinding,
  type TaskReport,
  taskAttempts,
  type GrantedWrite,
  type StoredSymphony,
  type TaskDefinition,
} from "../symphonies/models";

/** What each structured failure `need` value asks the Conductor to do. */
export const NEED_ACTIONS: Record<FailureNeed, string> = {
  scope: "Needs wider write scope",
  input: "Needs user input",
  model: "Needs a different profile or model",
  harness: "Needs a harness, environment or permission fix",
  none: "Needs a direction to continue",
};

/** Colors and glyphs per check status. */
export const CHECK_STATUS: Record<
  TaskReport["checks"][number]["status"],
  { glyph: string; word: string; color: StatusColor }
> = {
  passed: { glyph: "✓", word: "Passed", color: "statusSuccess" },
  failed: { glyph: "✕", word: "Failed", color: "statusDanger" },
  "not-run": { glyph: "–", word: "Not run", color: "foregroundMuted" },
};

/** Colors and glyphs per finding severity; blocking always leads a panel. */
export const FINDING_SEVERITY: Record<
  TaskFinding["severity"],
  { glyph: string; word: string; color: StatusColor }
> = {
  blocking: { glyph: "✕", word: "Blocking", color: "statusDanger" },
  minor: { glyph: "•", word: "Minor", color: "statusWarning" },
};

/**
 * Full task brief shown behind the Instructions disclosure: the assignment,
 * then the bounds that tell a task agent where to stop.
 */
export function instructionLines(task: TaskDefinition): string[] {
  const lines: string[] = [task.outcome];
  if (task.criteria.length) {
    lines.push(`Success criteria: ${task.criteria.join("; ")}`);
  }
  if (task.checks.length) {
    lines.push(`Planned checks: ${task.checks.join("; ")}`);
  }
  if (task.reads.length) {
    lines.push(`Reads: ${task.reads.join(", ")}`);
  }
  if (task.writes.length) {
    lines.push(`Writes: ${task.writes.join(", ")}`);
  }
  const { provider, model, thinkingOptionId } = task.worker;
  const inline = [
    [provider, model].filter(Boolean).join("/"),
    thinkingOptionId ? `thinking ${thinkingOptionId}` : "",
  ].filter(Boolean);
  // The stored name snapshot keeps the card readable after a profile is
  // renamed or deleted; the raw reference only shows when none was stored.
  lines.push(
    inline.length
      ? `Task agent: ${inline.join(", ")}`
      : `Task agent profile: ${task.worker.profileName ?? task.worker.profile}`,
  );
  if (task.routing) {
    lines.push(`Routing: ${task.routing.reason}`);
  }
  lines.push(`Stop when: ${task.stopWhen}`);
  return lines;
}

/**
 * Conductor write additions across every attempt of the task, deduped by path
 * with each path's first reason kept: additions last for the task, not for one
 * attempt.
 */
export function addedWritesFor(
  symphony: StoredSymphony,
  taskId: string,
): GrantedWrite[] {
  const byPath = new Map<string, GrantedWrite>();
  for (const grant of taskAttempts(symphony, taskId).flatMap(
    (attempt) => attempt.addedWrites ?? [],
  )) {
    if (!byPath.has(grant.path)) {
      byPath.set(grant.path, grant);
    }
  }
  return [...byPath.values()];
}

export const PREVIEW_LINES = 3;

/** First up-to-three nonempty preview lines of summary prose. */
export function previewLines(value: string): string[] {
  return value
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .slice(0, PREVIEW_LINES);
}

/** The report's failed checks, which a card keeps visible without expanding. */
export function failedChecks(
  report: Pick<TaskReport, "checks">,
): TaskReport["checks"] {
  return report.checks.filter((check) => check.status === "failed");
}

/** The Checks toggle label, e.g. "Checks 2/3 passed · 1 failed". */
export function checksLabel(checks: TaskReport["checks"]): string {
  const failed = checks.filter((check) => check.status === "failed").length;
  const passed = checks.filter((check) => check.status === "passed").length;
  return `Checks ${passed}/${checks.length} passed${
    failed ? ` · ${failed} failed` : ""
  }`;
}

/** How many findings block. */
export function blockingFindingCount(findings: readonly TaskFinding[]): number {
  return findings.filter((finding) => finding.severity === "blocking").length;
}

/** The Findings toggle label, e.g. "Findings 3 · 1 blocking". */
export function findingsLabel(findings: readonly TaskFinding[]): string {
  const blocking = blockingFindingCount(findings);
  return `Findings ${findings.length}${blocking ? ` · ${blocking} blocking` : ""}`;
}

/** Findings with blocking ones first, otherwise in stored order. */
export function sortedFindings(
  findings: readonly TaskFinding[],
): TaskFinding[] {
  const rank = (finding: TaskFinding) =>
    finding.severity === "blocking" ? 0 : 1;
  return [...findings].sort((a, b) => rank(a) - rank(b));
}
