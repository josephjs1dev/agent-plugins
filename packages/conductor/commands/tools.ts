import { z } from "zod";
import {
  symphonyCommandSchema,
  type SymphonyCommand,
} from "../symphonies/commands";

const descriptions = {
  orchestrate:
    'Start a conducted symphony for authorized multi-part work and become its Conductor agent. key is a stable request key: reuse it after an uncertain result, and a repeated key returns the same symphony. goal carries the plan, constraints and acceptance criteria. concurrency is 1-4 (default 3); maxLoops is 1-5 (default 3). autoLoop (default true) reopens the owning tasks of a routine needs-changes loop without a Conductor turn. Set conductor "agent", optionally with conductorProfile, only when the user wants a dedicated Conductor agent. The result\'s instructions explain how to define, dispatch and finish.',
  define:
    "Conductor only. Record the symphony's task score once. Each task needs id, title and a standalone description, plus dependsOn, reads, writes and checks. Always set writes: [] is read-only, and an omitted writes covers the checkout and runs that task alone. Set review true for a read-only review task. role planning needs openDecision. Choose a worker with either profile or provider/model/thinkingOptionId, and give routing {reason, override?}.",
  loop: 'Conductor only. After a loop ends needing changes, start the next loop in the same symphony. reopen names each owning task with its findings ("<reporter task>#<id>"), an optional note, addWrites, after (loop-only prerequisites) and a worker override with routing.reason. tasks appends new tasks. deferred lists open items not reopened, with reasons. Every blocking finding and needs-changes task must be reopened or deferred. Past the loop budget, approval {loops, userAnswer} needs the user\'s own answer.',
  dispatch:
    "Conductor only. Create task agents for ready tasks; dependencies are followed automatically. retryTaskId resumes a settled blocked task or retries a settled failed attempt, at most 2 failed retries per loop. A needs-changes task uses loop instead. note and addWrites require retryTaskId. A replacement worker (profile or provider/model/thinkingOptionId) needs routing.reason. An active task agent is never replaced.",
  route:
    "Read-only routing preview. Give a role (exploration, implementation, planning or review) and optionally an explicit profile or provider/model/thinkingOptionId. Returns the selected profile, eligible alternatives ordered by size, exclusions and reasons.",
  profiles:
    "List the Conductor's worker profiles with routing classification, the provider catalog, the catalog revision and diagnostics. Takes no arguments.",
  models:
    "List available providers and model IDs for a per-task worker choice. Takes no arguments.",
  start:
    "Source-only tracking, not orchestration: record a symphony for work you do yourself. key is stable per agent; repeat identical input after a lost acknowledgement. Omitted tasks create one task named work with checkout-wide scope. Use orchestrate to delegate work to task agents.",
  list: "List the symphonies you own. Takes no arguments.",
  get: "Inspect a symphony you own or are assigned to, including saved reports. Use this to verify an uncertain acknowledgement before retrying.",
  claim:
    "Source-only workflow: claim a task in a symphony you started, before you work on it. Keep the returned attempt ID. Repeating a claim returns the unfinished attempt; retry true starts a new attempt only after an explicitly failed one.",
  report:
    "Save your assigned attempt's completed, needs-changes or failed report with actual evidence and check results. Use the symphonyId and attemptId from your assignment. Give a result for every required check. completed needs every declared check passed and no blocking findings; needs-changes needs at least one blocking finding or failed check and is resolved by the next loop, not retried; failed is for a harness problem (launch, unreachable agent, missing permissions, unavailable model) and needs a diagnosis. A review names each blocking defect in findings with its owning taskId and path:line. Reporting succeeds only when the result contains your saved report. Inspect the returned acknowledgement, then end your turn.",
  block:
    "Record a blocker on your assigned attempt when you need input or cannot proceed. This does not report successful completion. Use when you need input or cannot proceed and no report applies. The Conductor resumes you with an answer.",
  finish:
    "End a symphony you own after every task's latest attempt is completed and its agent has settled. summary states what changed, the check results, the loop count, deferred items and granted paths. When the user chose to stop with open work, unresolved [{finding|taskId, reason}] must cover every open finding and non-completed task; the symphony then ends failed.",
  widen:
    'Request extra checkout-relative write paths for your assigned attempt. Subject to scope limits and resource conflict checks; never grants OS permissions. Only for a file your own change broke, or one that blocks a required check. A refusal names the holder; then report failed with need "scope" and requestedWrites instead of editing the file.',
} as const satisfies Record<SymphonyCommand["kind"], string>;

const readOnly = new Set<SymphonyCommand["kind"]>([
  "route",
  "profiles",
  "models",
  "list",
  "get",
]);

// Reuse the command schemas: the command executor still validates refinements and ownership.
/** One tool per Conductor command, with a JSON schema that omits `kind`. */
export const commandTools = symphonyCommandSchema.options.map((schema) => {
  const kind = schema.shape.kind.value;
  const inputSchema = z.toJSONSchema(schema, { io: "input" });
  delete inputSchema.properties?.kind;
  if (inputSchema.required) {
    inputSchema.required = inputSchema.required.filter(
      (name) => name !== "kind",
    );
  }
  return {
    name: kind,
    description: descriptions[kind],
    inputSchema,
    annotations: {
      readOnlyHint: readOnly.has(kind),
      destructiveHint: false,
      idempotentHint: readOnly.has(kind) || kind === "report",
      openWorldHint: false,
    },
  };
});
