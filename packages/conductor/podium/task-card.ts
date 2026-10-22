/**
 * Render-only facts the Podium task card shows for one task. Pure data with no
 * view imports, like routing.ts: every host's card renders these directly.
 */
import {
  latestAttempt,
  type Attempt,
  type StoredSymphony,
  type TaskDefinition,
} from "../symphonies/models";
import { attemptLoop } from "../symphonies/score";
import { launchWorker, type WorkerSpec } from "./routing";
import type { WorkerIdentity } from "./worker-identity";

export interface TaskCardFacts {
  /** The latest attempt, whose report and launch the card shows. */
  readonly attempt: Attempt | undefined;
  /** The earlier loop whose result the task carries into the viewed loop. */
  readonly carriedFrom: number | undefined;
  /** Attempts of this task that ran on the latest attempt's agent. */
  readonly agentAttempts: number;
  /** The viewed attempt's routing, else the task's routing as last routed. */
  readonly routing: NonNullable<Attempt["launch"]>["routing"];
  /** The worker that runs: the launch's choice, else the task's worker. */
  readonly worker: WorkerSpec;
  /** True when the latest attempt has an agent that launched. */
  readonly hasAgent: boolean;
}

/**
 * The card facts for a task. With `loop`, a task that did not re-run in the
 * viewed loop names the earlier loop whose result it keeps. The launch's own
 * choice and routing win, so a takeover keeps showing the worker that actually
 * runs; waiting or legacy records without a launch fall back to the task.
 */
export function taskCardFacts(
  symphony: StoredSymphony,
  task: TaskDefinition,
  loop?: number,
): TaskCardFacts {
  const attempt = latestAttempt(symphony, task.id);
  const launch = attempt?.launch;
  const carriedFrom =
    loop !== undefined && attempt && attemptLoop(attempt) < loop
      ? attemptLoop(attempt)
      : undefined;
  const agentAttempts = attempt
    ? symphony.execution.attempts.filter(
        (entry) =>
          entry.taskId === task.id && entry.agentId === attempt.agentId,
      ).length
    : 0;
  return {
    attempt,
    carriedFrom,
    agentAttempts,
    routing: launch?.routing ?? task.routing,
    worker: launch ? launchWorker(launch) : task.worker,
    hasAgent: Boolean(attempt?.agentId && launch?.state !== "failed"),
  };
}

/** The worker row's text: model, then thinking option, e.g. "Opus · High". */
export function workerLine(identity: WorkerIdentity): string {
  return [identity.modelLabel, identity.thinkingLabel]
    .filter(Boolean)
    .join(" · ");
}

/** The no-report Routing disclosure label, e.g. "Routing · 2 warnings". */
export function routingDisclosureLabel(warningCount: number): string {
  if (!warningCount) {
    return "Routing";
  }
  return `Routing · ${warningCount} warning${warningCount === 1 ? "" : "s"}`;
}

/** The write-scope disclosure label for Conductor-added or widened paths. */
export function writesDisclosureLabel(
  kind: "added" | "granted",
  count: number,
): string {
  return kind === "added"
    ? `Added by Conductor ${count}`
    : `Granted writes ${count}`;
}
