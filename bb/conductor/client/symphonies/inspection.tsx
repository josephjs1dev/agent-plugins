import { useState, type ReactNode } from "react";
import {
  attemptNumber,
  taskAttempts,
  type Attempt,
  type LoopRecord,
  type Score,
  type StoredSymphony,
  type SymphonyContext,
  type TaskDefinition,
} from "conductor/symphonies/models";
import { TASK_STATE_LABELS, taskState } from "conductor/symphonies/task-state";
import type { TaskStateKey } from "conductor/symphonies/task-state";
import { attemptLoop } from "conductor/symphonies/score";
import type { ProfilesState } from "conductor/symphonies/profiles";
import type { ProviderCatalog } from "conductor/symphonies/profiles-contracts";
import {
  addressedFindingsLabel,
  attemptState,
  groupedTaskState,
  hasLoopGroups,
  historyLoops,
  loopRecord,
  loopVerdictColor,
  loopVerdictLabel,
  retryLabel,
  unresolvedItemLabel,
  type HistoryLoopGroup,
} from "conductor/podium/history";
import { TASK_STATE_COLORS, type StatusColor } from "conductor/podium/status";
import {
  launchWorker,
  overrideLine,
  reopenWorker,
  routingLine,
  shortRevision,
  warningLine,
  workerSelection,
} from "conductor/podium/routing";
import {
  attemptCountLabel,
  attemptDurationLabel,
  attemptTokensLabel,
  shortTimestamp,
} from "conductor/podium/labels";
import {
  distinctExpectedOutcome,
  planAcceptedLine,
  reopenFindingLines,
  writeScopeGrownTasks,
} from "conductor/podium/context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePodium } from "../podium/context";
import { Disclosure, Notice, SectionLabel } from "../ui/notice";
import { STATUS_FILL, STATUS_TEXT } from "../ui/status";
import { ScoreView } from "./graph";
import { DiagnosisPanel, FindingsPanel, InsetPanel } from "./task-report";

/** The profile data the graph's node identity reads. */
export interface InspectionProfiles {
  readonly state: ProfilesState | undefined;
  readonly providers: ProviderCatalog | undefined;
}

const BODY = "text-[13px] leading-5 text-foreground";
const MUTED = "text-[13px] leading-5 text-muted-foreground";
const LINE = "text-xs leading-[17px] text-muted-foreground";

/**
 * The Context, History and Graph tabs of a symphony detail. The Tasks tab's
 * cards render beside it in the detail.
 */
export function SymphonyInspection({
  view,
  symphony,
  context,
  score,
  compact = false,
  loop,
  openAgent,
  profiles,
}: {
  view: string;
  symphony: StoredSymphony;
  context: SymphonyContext;
  score: Score;
  /** Layout hint carried to the graph. */
  compact?: boolean;
  /** The loop the Tasks, Graph and Context tabs show, when there are several. */
  loop?: number;
  /** Opens a task agent's thread; defaults to the Podium's `openAgent`. */
  openAgent?: (id: string) => void;
  /** Worker profiles and provider catalog; the graph node identity reads them. */
  profiles?: InspectionProfiles;
}) {
  const podium = usePodium();
  const open = openAgent ?? podium.openAgent;
  const record = loop ? loopRecord(symphony, loop) : undefined;
  if (view === "context") {
    const outcome = distinctExpectedOutcome(context);
    return (
      <section className="space-y-3">
        {record && <LoopContext record={record} />}
        {record && <SectionLabel>Goal</SectionLabel>}
        <p className="text-sm leading-[23px] whitespace-pre-wrap text-foreground">
          {context.plan}
        </p>
        <PlanLine symphony={symphony} />
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm leading-[21px] text-muted-foreground">
          <ContextFact label="Source">{context.provenance}</ContextFact>
          {outcome !== null && (
            <ContextFact label="Expected outcome">{outcome}</ContextFact>
          )}
          <ContextFact label="Accepted decisions">
            {context.decisions.join("; ") || "None"}
          </ContextFact>
          <ContextFact label="Constraints">
            {context.constraints.join("; ") || "None"}
          </ContextFact>
          <ContextFact label="Checkout">{symphony.source.checkout}</ContextFact>
          <ContextFact label="Base">
            {symphony.source.base ?? "Unknown"}
          </ContextFact>
          <ContextFact label="Initial tracked-change fingerprint">
            {symphony.source.dirtyFingerprint ?? "Unknown"}
          </ContextFact>
        </dl>
      </section>
    );
  }
  if (view === "history") {
    return (
      <section className="space-y-1">
        <SectionLabel>History</SectionLabel>
        <HistoryBody symphony={symphony} openAgent={open} />
      </section>
    );
  }
  if (view === "graph") {
    return (
      <section className="space-y-3">
        <SectionLabel>Task dependencies</SectionLabel>
        <p className={MUTED}>
          Every task lists its own status; arrows point from a prerequisite to
          the task that depends on it, and dashed connectors mark shared
          resources that need serialization without adding prerequisites. Select
          a task to inspect its relationships below the score; its Open agent
          action there opens the task agent when one is running.
        </p>
        <ScoreView
          symphony={symphony}
          score={score}
          compact={compact}
          profiles={profiles?.state?.profiles}
          catalog={profiles?.providers}
          openAgent={open}
        />
      </section>
    );
  }
  return null;
}

function ContextFact({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <>
      <dt>{`${label}:`}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

/** A small status dot; the adjacent label carries its meaning. */
function Dot({ color }: { color: StatusColor }) {
  return (
    <span
      aria-hidden
      className={cn("size-1.5 shrink-0 rounded-full", STATUS_FILL[color])}
    />
  );
}

/** A task state as a dot plus its label. */
function StateLabel({ state }: { state: TaskStateKey }) {
  const color = TASK_STATE_COLORS[state];
  return (
    <>
      <Dot color={color} />
      <span
        className={cn("text-xs leading-[17px] font-medium", STATUS_TEXT[color])}
      >
        {TASK_STATE_LABELS[state]}
      </span>
    </>
  );
}

/**
 * Why the Conductor started a later loop: its reason, each reopened task with
 * the findings it must fix and any note, appended tasks, deferred items, and
 * the user's recorded answer when the loop went past the budget.
 */
function LoopContext({ record }: { record: LoopRecord }) {
  return (
    <div data-testid={`loop-context-${record.number}`} className="space-y-2">
      <SectionLabel>{`Why loop ${record.number} started`}</SectionLabel>
      <p className={BODY}>{record.reason}</p>
      {record.reopened.map((reopen) => (
        <div key={reopen.taskId} className="space-y-0.5">
          <p className={cn(BODY, "font-semibold")}>
            {`Reopened ${reopen.taskId}`}
            {reopen.after?.length ? ` · after ${reopen.after.join(", ")}` : ""}
          </p>
          <ul>
            {reopenFindingLines(reopen).map((line) => (
              <li key={line} className={MUTED}>
                {`• ${line}`}
              </li>
            ))}
          </ul>
          {reopen.note && <p className={MUTED}>{`Note: ${reopen.note}`}</p>}
          {reopen.worker && (
            <p
              data-testid={`loop-reopen-worker-${reopen.taskId}`}
              className={MUTED}
            >
              {reopen.routing
                ? routingLine(reopen.routing, reopenWorker(reopen.worker))
                : `Worker: ${workerSelection(reopen.worker)}`}
            </p>
          )}
          {reopen.routing?.override && (
            <p className={MUTED}>{overrideLine(reopen.routing)}</p>
          )}
          {(reopen.warnings ?? []).map((warning, index) => (
            <p
              key={`${warning.code}-${index}`}
              className={cn("text-[13px] leading-5", STATUS_TEXT.statusWarning)}
            >
              {warningLine(warning)}
            </p>
          ))}
        </div>
      ))}
      {record.added.length > 0 && (
        <p className={MUTED}>{`Added tasks: ${record.added.join(", ")}`}</p>
      )}
      {record.deferred.map((item, index) => (
        <p key={`${item.finding ?? item.taskId}-${index}`} className={MUTED}>
          {`Deferred: ${unresolvedItemLabel(item)}`}
        </p>
      ))}
      {record.approval && (
        <p className={MUTED}>
          {`User approved loop ${record.approval.loops}: "${record.approval.userAnswer}"`}
        </p>
      )}
    </div>
  );
}

/**
 * The accepted plan as one line. Older symphonies whose Conductor grew write
 * scope through a new revision also name the affected tasks here, because
 * their History rows cannot attribute those paths to one attempt.
 */
function PlanLine({ symphony }: { symphony: StoredSymphony }) {
  const line = planAcceptedLine(symphony);
  if (!line) {
    return null;
  }
  const grown = writeScopeGrownTasks(symphony);
  return (
    <>
      <p data-testid="symphony-plan" className={cn(LINE, "tabular-nums")}>
        {line}
      </p>
      {grown.length > 0 && (
        <p data-testid="symphony-plan-added-writes" className={LINE}>
          {`Write scope later added by the Conductor to: ${grown.join(", ")}`}
        </p>
      )}
    </>
  );
}

/**
 * Compact symphony history. With more than one loop, every attempt groups by
 * loop under a verdict header; otherwise one flat section per task in score
 * order. Report summaries stay on the task cards; only a blocker or failure
 * message shows here.
 */
function HistoryBody({
  symphony,
  openAgent,
}: {
  symphony: StoredSymphony;
  openAgent: (id: string) => void;
}) {
  const tasks = symphony.revisions.at(-1)?.score.tasks ?? [];
  if (!tasks.length) {
    return <Notice>No task attempts yet.</Notice>;
  }
  if (hasLoopGroups(symphony)) {
    return (
      <div className="space-y-3">
        {historyLoops(symphony).map((group) => (
          <div
            key={group.loop}
            data-testid={`history-loop-${group.loop}`}
            className="space-y-1 border-t border-border pt-2"
          >
            <LoopHeader group={group} />
            {tasks
              .filter((task) =>
                group.attempts.some((attempt) => attempt.taskId === task.id),
              )
              .map((task) => (
                <TaskHistory
                  key={task.id}
                  symphony={symphony}
                  task={task}
                  attempts={group.attempts.filter(
                    (attempt) => attempt.taskId === task.id,
                  )}
                  grouped
                  openAgent={openAgent}
                />
              ))}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div>
      {tasks.map((task) => (
        <TaskHistory
          key={task.id}
          symphony={symphony}
          task={task}
          openAgent={openAgent}
        />
      ))}
    </div>
  );
}

/**
 * One loop's History header: the loop number, its verdict, and the Conductor
 * facts stored on the loop record — the reopen reason, the user's recorded
 * answer when the loop went past the budget, and deferred sections.
 */
function LoopHeader({ group }: { group: HistoryLoopGroup }) {
  const color = loopVerdictColor(group);
  return (
    <div className="space-y-0.5">
      <h4 className="flex items-center gap-1.5">
        <span className="text-[13px] leading-[18px] font-semibold text-foreground">
          {`Loop ${group.loop}`}
        </span>
        <Dot color={color} />
        <span
          className={cn(
            "text-xs leading-[17px] font-medium",
            STATUS_TEXT[color],
          )}
        >
          {loopVerdictLabel(group)}
        </span>
      </h4>
      {group.reason && (
        <p
          data-testid={`history-loop-reason-${group.loop}`}
          className={cn(LINE, "line-clamp-2")}
        >
          {`Reopened because: ${group.reason}`}
        </p>
      )}
      {group.approval && (
        <p
          data-testid={`history-loop-approval-${group.loop}`}
          className={cn(LINE, "line-clamp-2")}
        >
          {`User approved loop ${group.approval.loops}: "${group.approval.userAnswer}"`}
        </p>
      )}
      {group.deferred.map((item, index) => (
        <p key={`${item.label}-${index}`} className={cn(LINE, "line-clamp-2")}>
          {`Deferred: ${item.label} — ${item.reason}`}
        </p>
      ))}
    </div>
  );
}

/**
 * One task's history: its current state when idle, else its attempts oldest
 * first. With `attempts` and `grouped`, the rows render for one loop group,
 * whose header speaks for that loop's last attempt so a historical loop never
 * inherits the task's newer state.
 */
function TaskHistory({
  symphony,
  task,
  openAgent,
  attempts: attemptOverride,
  grouped = false,
}: {
  symphony: StoredSymphony;
  task: TaskDefinition;
  openAgent: (id: string) => void;
  attempts?: readonly Attempt[];
  grouped?: boolean;
}) {
  const attempts = attemptOverride ?? taskAttempts(symphony, task.id);
  const first = attempts[0];
  const testId =
    grouped && first
      ? `history-task-${task.id}-loop-${attemptLoop(first)}`
      : `history-task-${task.id}`;
  if (!attempts.length) {
    return (
      <div
        data-testid={`history-task-${task.id}`}
        className="flex min-h-8 flex-wrap items-center gap-1.5 border-t border-border py-1"
      >
        <span className="min-w-0 text-[13px] leading-[18px] font-semibold text-foreground">
          {task.id}
        </span>
        <StateLabel state={taskState(symphony, task).key} />
      </div>
    );
  }
  const retried = attempts.length > 1;
  const lastAttempt = attempts.at(-1);
  // A loop group states its own last attempt's outcome; the ungrouped view
  // keeps the task's overall display state.
  const stateKey =
    grouped && lastAttempt
      ? groupedTaskState(lastAttempt)
      : taskState(symphony, task).key;
  return (
    <div
      data-testid={testId}
      className="space-y-0.5 border-t border-border py-1"
    >
      {(retried || grouped) && lastAttempt && (
        <div className="flex min-h-5 flex-wrap items-center gap-1.5">
          <span className="min-w-0 text-[13px] leading-[18px] font-semibold text-foreground">
            {task.id}
          </span>
          <StateLabel state={stateKey} />
          {retried && (
            <span className={LINE}>{attemptCountLabel(attempts.length)}</span>
          )}
        </div>
      )}
      {attempts.map((attempt, index) => (
        <AttemptRow
          key={attempt.id}
          symphony={symphony}
          task={task}
          attempt={attempt}
          number={attemptNumber(symphony, attempt)}
          retried={retried}
          forceNumber={grouped}
          previousAgentId={index > 0 ? attempts[index - 1]?.agentId : undefined}
          openAgent={openAgent}
        />
      ))}
    </div>
  );
}

/**
 * One attempt row with its number, start time, duration, and token usage. A
 * task's only attempt renders as the task row itself, so it carries the task
 * ID before "Attempt 1"; a retried task labels each row "Attempt N" and says
 * how the retry ran. Reopen findings, scope changes, changed paths, routing
 * and the diagnosis appear beneath.
 */
function AttemptRow({
  symphony,
  task,
  attempt,
  number,
  retried,
  forceNumber = false,
  previousAgentId,
  openAgent,
}: {
  symphony: StoredSymphony;
  task: TaskDefinition;
  attempt: Attempt;
  number: number;
  retried: boolean;
  /** Number every row when a task appears in several loop groups. */
  forceNumber?: boolean;
  previousAgentId: string | undefined;
  openAgent: (id: string) => void;
}) {
  const diagnosis = attempt.report?.diagnosis;
  const reopen = attempt.reopen;
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  const [findingsOpen, setFindingsOpen] = useState(false);
  const numbered = retried || forceNumber;
  const suffix = numbered ? `-${number}` : "";
  return (
    <div
      data-testid={`history-attempt-${task.id}${suffix}`}
      className={cn(
        "flex min-h-8 min-w-0 flex-wrap items-center gap-1.5 py-1",
        numbered && "pl-3",
      )}
    >
      <span
        className={cn(
          "min-w-0 text-[13px] leading-[18px] text-foreground tabular-nums",
          numbered ? "font-normal" : "font-semibold",
        )}
      >
        {numbered ? `Attempt ${number}` : task.id}
      </span>
      {!numbered && (
        <span className={cn(LINE, "tabular-nums")}>{`Attempt ${number}`}</span>
      )}
      <StateLabel state={attemptState(symphony, attempt)} />
      <span className={cn(LINE, "min-w-0 truncate")}>
        {`Started ${shortTimestamp(attempt.startedAt)} · ${attemptDurationLabel(attempt)}`}
      </span>
      <span
        data-testid={`history-attempt-${task.id}${suffix}-tokens`}
        className={cn(LINE, "min-w-0 truncate tabular-nums")}
      >
        {attemptTokensLabel(attempt)}
      </span>
      {number > 1 && (
        <span className={LINE}>{retryLabel(attempt, previousAgentId)}</span>
      )}
      {attempt.launch?.state !== "failed" && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          aria-label={
            numbered
              ? `Open agent · ${task.id} attempt ${number}`
              : `Open agent · ${task.id}`
          }
          onClick={() => openAgent(attempt.agentId)}
        >
          Open agent
        </Button>
      )}
      {attempt.message && (
        <p className={cn(LINE, "line-clamp-2 w-full")}>{attempt.message}</p>
      )}
      {reopen && (
        <div className={cn("w-full space-y-0.5", retried && "pl-3")}>
          <p className={cn(LINE, "line-clamp-2")}>
            {`Reopened — ${reopen.reason}`}
          </p>
          {reopen.findings.length > 0 && (
            <Disclosure
              label={addressedFindingsLabel(reopen.findings, attempt)}
              expanded={findingsOpen}
              onToggle={() => setFindingsOpen((open) => !open)}
            >
              <InsetPanel>
                <FindingsPanel findings={reopen.findings} compact />
              </InsetPanel>
            </Disclosure>
          )}
        </div>
      )}
      <ScopeChanges attempt={attempt} indented={retried} />
      <ChangedPaths attempt={attempt} indented={retried} />
      <RoutingLines attempt={attempt} suffix={suffix} indented={retried} />
      {diagnosis && (
        <div className="w-full">
          <Disclosure
            label="Diagnosis"
            expanded={diagnosisOpen}
            onToggle={() => setDiagnosisOpen((open) => !open)}
          >
            <InsetPanel>
              <DiagnosisPanel diagnosis={diagnosis} />
            </InsetPanel>
          </Disclosure>
        </div>
      )}
    </div>
  );
}

/** A full-width block of attempt detail lines under the attempt row. */
function DetailLines({
  indented,
  testId,
  children,
}: {
  indented: boolean;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className={cn("w-full space-y-0.5", indented && "pl-3")}
    >
      {children}
    </div>
  );
}

/**
 * Paths the attempt changed in its write scope, recorded by the server from
 * the start/settle write-scope fingerprint diff. Advisory only, and "+ more"
 * marks a list capped by the stored-path limit.
 */
function ChangedPaths({
  attempt,
  indented,
}: {
  attempt: Attempt;
  indented: boolean;
}) {
  const changed = attempt.changedPaths;
  if (!changed?.length) {
    return null;
  }
  return (
    <DetailLines indented={indented}>
      <p className={cn(LINE, "line-clamp-2")}>
        {`Changed: ${changed.join(", ")}`}
      </p>
      {attempt.changedPathsTruncated && <p className={LINE}>+ more</p>}
    </DetailLines>
  );
}

/**
 * An attempt's persisted routing decision as lines under the attempt row: how
 * the worker was picked and why, the override with its category and evidence,
 * the validation warnings, and the catalog revision. Records stored before
 * routing existed render nothing here.
 */
function RoutingLines({
  attempt,
  suffix,
  indented,
}: {
  attempt: Attempt;
  suffix: string;
  indented: boolean;
}) {
  const launch = attempt.launch;
  const routing = launch?.routing;
  if (!launch || (!routing && !launch.warnings?.length)) {
    return null;
  }
  const override = routing ? overrideLine(routing) : null;
  const revision = shortRevision(launch.catalogRevision);
  return (
    <DetailLines
      indented={indented}
      testId={`history-routing-${attempt.taskId}${suffix}`}
    >
      {routing && (
        <p className={cn(LINE, "line-clamp-2")}>
          {routingLine(routing, launchWorker(launch))}
        </p>
      )}
      {override && <p className={cn(LINE, "line-clamp-2")}>{override}</p>}
      {(launch.warnings ?? []).map((warning, index) => (
        <p
          key={`${warning.code}-${index}`}
          className={cn(
            "line-clamp-2 text-xs leading-[17px]",
            STATUS_TEXT.statusWarning,
          )}
        >
          {warningLine(warning)}
        </p>
      ))}
      {revision && <p className={LINE}>{`Catalog revision: ${revision}`}</p>}
    </DetailLines>
  );
}

/**
 * Write-scope changes recorded on the attempt: paths the Conductor added for
 * this and later attempts, and paths a task agent's widen granted for the
 * attempt. One muted line per path, each with the reason it was needed.
 */
function ScopeChanges({
  attempt,
  indented,
}: {
  attempt: Attempt;
  indented: boolean;
}) {
  const added = attempt.addedWrites ?? [];
  const granted = attempt.grantedWrites ?? [];
  if (!added.length && !granted.length) {
    return null;
  }
  return (
    <DetailLines indented={indented}>
      {added.map((grant, index) => (
        <p
          key={`added-${grant.path}-${index}`}
          className={cn(LINE, "line-clamp-2")}
        >
          {`+ ${grant.path} added by Conductor — "${grant.reason}"`}
        </p>
      ))}
      {granted.map((grant, index) => (
        <p
          key={`granted-${grant.path}-${index}`}
          className={cn(LINE, "line-clamp-2")}
        >
          {`widened: ${grant.path} — "${grant.reason}"`}
        </p>
      ))}
    </DetailLines>
  );
}
