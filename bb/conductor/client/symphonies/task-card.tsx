import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { taskState } from "conductor/symphonies/task-state";
import {
  taskAttempts,
  type Attempt,
  type GrantedWrite,
  type StoredSymphony,
  type TaskDefinition,
} from "conductor/symphonies/models";
import { attemptLoop } from "conductor/symphonies/score";
import { taskMetrics } from "conductor/symphonies/metrics";
import type {
  AttemptRouting,
  RoutingWarning,
} from "conductor/symphonies/routing";
import type { ConductorProfile } from "conductor/symphonies/profiles";
import type { ProviderCatalog } from "conductor/symphonies/profiles-contracts";
import {
  overrideLine,
  routingLine,
  warningLine,
} from "conductor/podium/routing";
import {
  formatDuration,
  tokenTotalsLabel,
  workTotalsLabel,
} from "conductor/podium/labels";
import { taskStatusPresentation } from "conductor/podium/status";
import { identityLabel, taskIdentity } from "conductor/podium/worker-identity";
import {
  addedWritesFor,
  failedChecks as reportFailedChecks,
  instructionLines,
} from "conductor/podium/report";
import {
  routingDisclosureLabel,
  taskCardFacts,
  workerLine,
  writesDisclosureLabel,
} from "conductor/podium/task-card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { usePodium, useNow } from "../podium/context";
import { HarnessMark } from "../ui/harness-mark";
import { Disclosure, Notice } from "../ui/notice";
import { RoleChip } from "../ui/role-chip";
import { STATUS_TEXT, StatusIconGlyph } from "../ui/status";
import {
  FindingsPanel,
  InsetPanel,
  PROSE_CLASS,
  ReportFooter,
  type ReportRouting,
} from "./task-report";

/**
 * Which details a card currently reveals. Owned by the symphony detail so
 * state survives ordinary refreshes and resets when the symphony changes.
 */
export interface TaskDisclosures {
  readonly summary?: boolean;
  readonly instructions?: boolean;
  readonly evidence?: boolean;
  readonly checks?: boolean;
}

/**
 * A card's independently toggled details. Evidence and Checks are exclusive:
 * at most one inset panel is open per card, while the summary and instructions
 * toggles stay independent. The owner enforces the exclusivity.
 */
export type TaskDisclosure = "summary" | "instructions" | "evidence" | "checks";

const META = "text-xs leading-[17px] text-muted-foreground";

/**
 * One trimmed task record: wrapping title with the agent action, a worker row
 * (harness mark plus model and thinking, beside the task's role chip), a
 * metadata row led by the status icon and label, a three-line summary clamp,
 * and a quieter footer that keeps Evidence and Checks behind inset panels.
 * Blocker messages and failed checks stay visible without expanding anything.
 */
export function SymphonyTaskCard({
  symphony,
  task,
  profiles,
  catalog,
  compact = false,
  disclosures,
  onToggle,
  loop,
  openAgent,
}: {
  symphony: StoredSymphony;
  task: TaskDefinition;
  /** Worker profiles for identity resolution; empty while profiles load. */
  profiles: readonly ConductorProfile[];
  /** The provider catalog behind the worker line's display labels. */
  catalog: ProviderCatalog | undefined;
  compact?: boolean;
  disclosures?: TaskDisclosures;
  onToggle?: (selection: TaskDisclosure) => void;
  /** The loop being viewed, when the symphony has several. */
  loop?: number;
  /** Opens a task agent's thread; defaults to the Podium's `openAgent`. */
  openAgent?: (id: string) => void;
}) {
  const podium = usePodium();
  const open = openAgent ?? podium.openAgent;
  const now = useNow();
  const facts = taskCardFacts(symphony, task, loop);
  const { attempt, carriedFrom, agentAttempts } = facts;
  const launch = attempt?.launch;
  const state = taskState(symphony, task);
  const presentation = taskStatusPresentation(state);
  const report = attempt?.report ?? null;
  const failedChecks = report ? reportFailedChecks(report) : [];
  const grantedWrites = attempt?.grantedWrites ?? [];
  const addedWrites = addedWritesFor(symphony, task.id);
  // Summed work time, elapsed span, and tokens over every attempt of the
  // task, including retries on other agents and earlier loops.
  const metrics = taskMetrics(taskAttempts(symphony, task.id), now);
  // An unresolvable worker leaves the row out instead of naming a placeholder.
  const identity = taskIdentity(symphony, task, profiles, catalog);
  const provider = identity?.provider;
  const role = task.worker.role;
  return (
    <article
      data-testid={`symphony-task-${task.id}`}
      aria-labelledby={`symphony-task-${task.id}-title`}
      className={cn(
        "space-y-2 rounded-lg border border-border bg-card text-card-foreground",
        compact ? "p-3" : "p-4",
      )}
    >
      <div className="flex items-start gap-2">
        <h3
          id={`symphony-task-${task.id}-title`}
          className="min-w-0 flex-1 text-[15px] leading-[21px] font-semibold break-words text-foreground"
        >
          {task.title}
        </h3>
        {facts.hasAgent && attempt && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Open ${task.id} agent`}
            onClick={() => open(attempt.agentId)}
          >
            Open agent
            <Icon name="ExternalLink" aria-hidden />
          </Button>
        )}
      </div>
      {(provider || role) && (
        <div
          data-testid={`symphony-task-${task.id}-worker`}
          className="flex flex-wrap items-center gap-1.5"
        >
          {identity && provider && (
            <>
              <HarnessMark
                provider={provider}
                {...(identity.providerLabel
                  ? { label: identity.providerLabel }
                  : {})}
              />
              {/* The provider lives in the accessible label; sighted users
                  read it from the mark. */}
              <span
                aria-label={identityLabel(identity)}
                className="min-w-0 truncate text-xs leading-[17px] text-foreground"
              >
                {workerLine(identity)}
              </span>
            </>
          )}
          {role && <RoleChip role={role} />}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusIconGlyph
          icon={presentation.icon}
          className={cn("size-3.5", STATUS_TEXT[presentation.color])}
        />
        <span
          className={cn(
            "text-xs leading-[17px] font-medium",
            STATUS_TEXT[presentation.color],
          )}
        >
          {presentation.label}
          {state.waitingFor.length
            ? ` · waiting for ${state.waitingFor.join(", ")}`
            : ""}
        </span>
        <span className={cn(META, "tabular-nums")}>{`· ${task.id}`}</span>
        {carriedFrom !== undefined && (
          <span
            data-testid={`symphony-task-${task.id}-carried`}
            className={META}
          >
            {`· result from loop ${carriedFrom}`}
          </span>
        )}
        {agentAttempts > 1 && (
          <span className={META}>
            {`· same agent across ${agentAttempts} attempts`}
          </span>
        )}
      </div>
      {metrics.attemptCount > 0 && (
        <p
          data-testid={`symphony-task-${task.id}-metrics`}
          className={cn(META, "truncate tabular-nums")}
        >
          {[
            workTotalsLabel(metrics),
            `${formatDuration(metrics.elapsedMs)} elapsed`,
            tokenTotalsLabel(metrics.tokens),
          ].join(" · ")}
        </p>
      )}
      {facts.routing && (
        <p
          data-testid={`symphony-task-${task.id}-routing`}
          className={cn(META, "truncate")}
        >
          {routingLine(facts.routing, facts.worker)}
        </p>
      )}
      {report === null && (
        <RoutingDisclosure
          routing={facts.routing}
          warnings={launch?.warnings}
        />
      )}
      {report?.summary && (
        <Summary
          summary={report.summary}
          expanded={disclosures?.summary === true}
          onToggle={() => onToggle?.("summary")}
        />
      )}
      {failedChecks.map((check) => (
        <p
          key={check.name}
          className="line-clamp-2 text-[13px] leading-5 text-destructive"
        >
          {`✕ ${check.name}: ${check.detail}`}
        </p>
      ))}
      {attempt?.message && <Notice warning>{attempt.message}</Notice>}
      {attempt?.reopen && <ReopenDisclosure attempt={attempt} />}
      {report === null && (
        <InstructionPreview
          task={task}
          expanded={disclosures?.instructions === true}
          onToggle={() => onToggle?.("instructions")}
        />
      )}
      {report && (
        <ReportFooter
          taskId={task.id}
          report={report}
          compact={compact}
          evidenceOpen={disclosures?.evidence === true}
          checksOpen={disclosures?.checks === true}
          onToggle={(selection) => onToggle?.(selection)}
          nested
          {...(launch ? { routing: { launch } satisfies ReportRouting } : {})}
        />
      )}
      {addedWrites.length > 0 && attempt && (
        <WritesDisclosure kind="added" grants={addedWrites} />
      )}
      {grantedWrites.length > 0 && attempt && (
        <WritesDisclosure kind="granted" grants={grantedWrites} />
      )}
    </article>
  );
}

/** A divided card section that holds one disclosure. */
function CardSection({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-2 border-t border-border pt-2">{children}</div>
  );
}

/**
 * Routing details for a card with no report yet: the override category and
 * evidence plus any stored warnings, behind a disclosure so a running
 * takeover's card stays compact. Nothing renders when the record carries
 * neither; with a report, the report's Routing toggle shows the same details.
 */
function RoutingDisclosure({
  routing,
  warnings,
}: {
  routing?:
    | Pick<AttemptRouting, "reason" | "selectedBy" | "override">
    | undefined;
  warnings?: readonly RoutingWarning[] | undefined;
}) {
  const [open, setOpen] = useState(false);
  const override = routing ? overrideLine(routing) : null;
  const stored = warnings ?? [];
  if (!override && !stored.length) {
    return null;
  }
  return (
    <CardSection>
      <Disclosure
        label={routingDisclosureLabel(stored.length)}
        expanded={open}
        onToggle={() => setOpen((value) => !value)}
      >
        <InsetPanel nested>
          {override && (
            <p className={cn("text-[13px] leading-5", PROSE_CLASS)}>
              {override}
            </p>
          )}
          {stored.map((warning, index) => (
            <p
              key={`${warning.code}-${index}`}
              className={cn(
                "text-[13px] leading-5",
                PROSE_CLASS,
                STATUS_TEXT.statusWarning,
              )}
            >
              {warningLine(warning)}
            </p>
          ))}
        </InsetPanel>
      </Disclosure>
    </CardSection>
  );
}

/**
 * A reopened attempt's brief: why the Conductor reopened this task in a new
 * loop, then the findings the attempt addresses, so the fix work and the
 * reviewer's defects stay linked on the card itself.
 */
function ReopenDisclosure({ attempt }: { attempt: Attempt }) {
  const reopen = attempt.reopen;
  const [expanded, setExpanded] = useState(false);
  if (!reopen) {
    return null;
  }
  return (
    <CardSection>
      <Disclosure
        label={`Reopened · loop ${attemptLoop(attempt)}`}
        expanded={expanded}
        onToggle={() => setExpanded((open) => !open)}
      />
      <p className={cn(META, PROSE_CLASS, "line-clamp-2")}>{reopen.reason}</p>
      {expanded && reopen.findings.length > 0 && (
        <InsetPanel nested>
          <FindingsPanel findings={reopen.findings} />
        </InsetPanel>
      )}
    </CardSection>
  );
}

/**
 * Write paths recorded beyond the task's declared scope, each with its reason:
 * "added" paths came from the Conductor and last for the task, "granted" paths
 * came from the latest attempt's widen and last for that attempt. Visible with
 * or without a report, because a running attempt can already hold grants.
 */
function WritesDisclosure({
  kind,
  grants,
}: {
  kind: "added" | "granted";
  grants: readonly GrantedWrite[];
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <CardSection>
      <Disclosure
        label={writesDisclosureLabel(kind, grants.length)}
        expanded={expanded}
        onToggle={() => setExpanded((open) => !open)}
      >
        <InsetPanel nested>
          <ul className="divide-y divide-border">
            {grants.map((grant, index) => (
              <li key={`${grant.path}-${index}`} className="space-y-0.5 py-1.5">
                <p
                  className={cn(
                    "font-mono text-xs leading-5 font-semibold break-all",
                    PROSE_CLASS,
                  )}
                >
                  {grant.path}
                </p>
                <p
                  className={cn(
                    "text-[13px] leading-5 text-muted-foreground",
                    PROSE_CLASS,
                  )}
                >
                  {grant.reason}
                </p>
              </li>
            ))}
          </ul>
        </InsetPanel>
      </Disclosure>
    </CardSection>
  );
}

/**
 * Report prose clamped to three lines by default. The toggle appears only
 * when the clamp actually hides text, measured on the rendered element, or
 * while expanded so the reader can collapse it again. The expanded state
 * lives in the detail's disclosure map so it survives refreshes.
 */
function Summary({
  summary,
  expanded,
  onToggle,
}: {
  summary: string;
  expanded: boolean;
  onToggle(this: void): void;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || expanded) {
      return undefined;
    }
    const measure = () =>
      setClamped(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [summary, expanded]);
  return (
    <div className={cn("space-y-1", PROSE_CLASS)}>
      <p
        ref={ref}
        className={cn(
          "text-sm leading-[21px] break-words whitespace-pre-wrap text-foreground",
          !expanded && "line-clamp-3",
        )}
      >
        {summary}
      </p>
      {(clamped || expanded) && (
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          className="-ml-2 h-7 px-2 text-muted-foreground"
          onClick={onToggle}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      )}
    </div>
  );
}

/**
 * Assignment preview when no report exists: at most three visible lines above
 * a disclosure that reveals the full brief in an inset panel.
 */
function InstructionPreview({
  task,
  expanded,
  onToggle,
}: {
  task: TaskDefinition;
  expanded: boolean;
  onToggle(this: void): void;
}) {
  const lines = instructionLines(task);
  return (
    <div className="space-y-2">
      {lines.length > 0 && (
        <p
          className={cn(
            "line-clamp-3 text-[13px] leading-[21px] whitespace-pre-line text-muted-foreground",
            PROSE_CLASS,
          )}
        >
          {lines.join("\n")}
        </p>
      )}
      <CardSection>
        <Disclosure
          label="Instructions"
          expanded={expanded}
          onToggle={onToggle}
        >
          <InsetPanel nested>
            {lines.map((line, index) => (
              <p
                key={index}
                className={cn(
                  "text-[13px] leading-[21px] text-foreground",
                  PROSE_CLASS,
                )}
              >
                {line}
              </p>
            ))}
          </InsetPanel>
        </Disclosure>
      </CardSection>
    </div>
  );
}
