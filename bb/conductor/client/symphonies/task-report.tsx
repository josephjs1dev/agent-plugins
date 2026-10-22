import { useState, type ReactNode } from "react";
import type {
  Attempt,
  TaskDiagnosis,
  TaskFinding,
  TaskReport,
} from "conductor/symphonies/models";
import {
  launchWorker,
  overrideLine,
  routingLine,
  shortRevision,
  warningLine,
  workerSelection,
} from "conductor/podium/routing";
import {
  CHECK_STATUS,
  FINDING_SEVERITY,
  NEED_ACTIONS,
  blockingFindingCount,
  checksLabel,
  failedChecks,
  findingsLabel,
  sortedFindings,
} from "conductor/podium/report";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { STATUS_TEXT } from "../ui/status";

/** Readable line length for task prose in cards and report panels. */
export const PROSE_CLASS = "max-w-[760px]";

/** A panel's small field label, quieter than the prose it introduces. */
const FIELD_LABEL = "text-xs font-semibold text-muted-foreground";
const BODY = cn("text-[13px] leading-5 text-foreground", PROSE_CLASS);
const WARNING_TEXT = STATUS_TEXT.statusWarning;

/**
 * A launch's routing decision as the report panel shows it: the effective
 * launch choice plus what was stored on it. Absent on records stored before
 * routing existed, which then render no Routing toggle at all.
 */
export interface ReportRouting {
  readonly launch: NonNullable<Attempt["launch"]>;
}

/**
 * Card footer: a hairline divider, the Evidence/Checks/Diagnosis/Routing/
 * Findings toggle row, and each open panel as an inset surface. The card's
 * owner holds Evidence and Checks so they survive refreshes; the rest are
 * local.
 */
export function ReportFooter({
  taskId,
  report,
  compact,
  evidenceOpen,
  checksOpen,
  onToggle,
  nested = false,
  routing,
}: {
  taskId: string;
  report: TaskReport;
  compact: boolean;
  evidenceOpen: boolean;
  checksOpen: boolean;
  onToggle(this: void, selection: "evidence" | "checks"): void;
  /** Inset fill inside an already raised card. */
  nested?: boolean;
  /** The attempt's persisted launch routing, when the record carries one. */
  routing?: ReportRouting;
}) {
  const failed = failedChecks(report).length;
  const findings = report.findings ?? [];
  const blocking = blockingFindingCount(findings);
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  const [findingsOpen, setFindingsOpen] = useState(false);
  const [routingOpen, setRoutingOpen] = useState(false);
  const launch = routing?.launch;
  const routingShown = Boolean(launch?.routing || launch?.warnings?.length);
  const dense = !compact;
  return (
    <div className="space-y-2 border-t border-border pt-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {report.evidence.length > 0 && (
          <FooterToggle
            label={`Evidence ${report.evidence.length}`}
            expanded={evidenceOpen}
            onToggle={() => onToggle("evidence")}
            testId={`symphony-task-evidence-${taskId}`}
            dense={dense}
          />
        )}
        {report.checks.length > 0 && (
          <FooterToggle
            label={checksLabel(report.checks)}
            danger={failed > 0}
            expanded={checksOpen}
            onToggle={() => onToggle("checks")}
            testId={`symphony-task-checks-${taskId}`}
            dense={dense}
          />
        )}
        {report.diagnosis && (
          <FooterToggle
            label="Diagnosis"
            danger
            expanded={diagnosisOpen}
            onToggle={() => setDiagnosisOpen((open) => !open)}
            testId={`symphony-task-diagnosis-${taskId}`}
            dense={dense}
          />
        )}
        {routingShown && launch && (
          <FooterToggle
            label="Routing"
            expanded={routingOpen}
            onToggle={() => setRoutingOpen((open) => !open)}
            testId={`symphony-task-routing-${taskId}`}
            dense={dense}
          />
        )}
        {findings.length > 0 && (
          <FooterToggle
            label={findingsLabel(findings)}
            danger={blocking > 0}
            expanded={findingsOpen}
            onToggle={() => setFindingsOpen((open) => !open)}
            testId={`symphony-task-findings-${taskId}`}
            dense={dense}
          />
        )}
      </div>
      {findingsOpen && findings.length > 0 && (
        <InsetPanel nested={nested}>
          <FindingsPanel findings={findings} />
        </InsetPanel>
      )}
      {evidenceOpen && (
        <InsetPanel nested={nested}>
          <EvidencePanel evidence={report.evidence} />
        </InsetPanel>
      )}
      {checksOpen && (
        <InsetPanel nested={nested}>
          <ChecksPanel checks={report.checks} />
        </InsetPanel>
      )}
      {routingOpen && launch && (
        <InsetPanel nested={nested}>
          <RoutingPanel launch={launch} />
        </InsetPanel>
      )}
      {diagnosisOpen && report.diagnosis && (
        <InsetPanel nested={nested}>
          <DiagnosisPanel diagnosis={report.diagnosis} />
        </InsetPanel>
      )}
    </div>
  );
}

/** One labelled section of a panel. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className={FIELD_LABEL}>{label}</p>
      {children}
    </div>
  );
}

/**
 * A failed report's task agent self-diagnosis: fix rounds tried, the suspected
 * cause, what the task agent needs next, and the write paths it requested when
 * it ran out of scope.
 */
export function DiagnosisPanel({ diagnosis }: { diagnosis: TaskDiagnosis }) {
  return (
    <div className="space-y-2">
      <Field label="Tried">
        <ol className="space-y-0.5">
          {diagnosis.tried.map((entry, index) => (
            <li key={index} className={BODY}>
              {`${index + 1}. ${entry}`}
            </li>
          ))}
        </ol>
      </Field>
      <Field label="Suspected cause">
        <p className={BODY}>{diagnosis.suspectedCause}</p>
      </Field>
      <Field label="Need">
        <p className="text-[13px] leading-5 text-destructive">
          {NEED_ACTIONS[diagnosis.need]}
        </p>
        {diagnosis.requestedWrites?.map((path) => (
          <p key={path} className={cn(BODY, "font-mono text-xs")}>
            {path}
          </p>
        ))}
      </Field>
    </div>
  );
}

/**
 * An attempt's persisted routing decision: the effective launch choice, how
 * it was picked and why, the override with its category and evidence, the
 * validation warnings the server returned, and the catalog revision the
 * choice was validated against. Absent pieces are skipped.
 */
export function RoutingPanel({
  launch,
}: {
  launch: NonNullable<Attempt["launch"]>;
}) {
  const routing = launch.routing;
  const warnings = launch.warnings ?? [];
  const override = routing ? overrideLine(routing) : null;
  const revision = shortRevision(launch.catalogRevision);
  const selection = launchWorker(launch);
  return (
    <div className="space-y-2">
      <Field label="Launched">
        <p className={BODY}>
          {routing
            ? routingLine(routing, selection)
            : workerSelection(selection)}
        </p>
      </Field>
      {override && (
        <Field label="Override">
          <p className={BODY}>{override}</p>
        </Field>
      )}
      {warnings.length > 0 && (
        <Field label="Warnings">
          {warnings.map((warning, index) => (
            <p
              key={`${warning.code}-${index}`}
              className={cn(BODY, WARNING_TEXT)}
            >
              {warningLine(warning)}
            </p>
          ))}
        </Field>
      )}
      {revision && (
        <p className={cn(BODY, "text-muted-foreground")}>
          {`Catalog revision: ${revision}`}
        </p>
      )}
    </div>
  );
}

/**
 * Footer disclosure toggle: a chevron and a quiet label that names what
 * opens, in the danger color when a check failed or a finding blocks.
 */
function FooterToggle({
  label,
  expanded,
  onToggle,
  testId,
  dense,
  danger = false,
}: {
  label: string;
  expanded: boolean;
  onToggle(this: void): void;
  testId: string;
  dense: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-expanded={expanded}
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium hover:bg-state-hover focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
        dense ? "min-h-8" : "min-h-11",
        danger ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <Icon
        name={expanded ? "ChevronDown" : "ChevronRight"}
        aria-hidden
        className="size-3.5 shrink-0 text-muted-foreground"
      />
      {label}
    </button>
  );
}

/**
 * Inset surface for revealed details at the full card width. Inside an
 * already raised card, `nested` deepens the fill so the inset still reads
 * against the card's own.
 */
export function InsetPanel({
  children,
  nested = false,
}: {
  children: ReactNode;
  nested?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border p-3",
        nested ? "bg-muted" : "bg-muted/40",
      )}
    >
      {children}
    </div>
  );
}

/**
 * Indexed evidence rows separated by hairlines. Each row is clamped to four
 * lines and expands on click so a long entry never dominates the card.
 */
function EvidencePanel({ evidence }: { evidence: readonly string[] }) {
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const toggle = (index: number) =>
    setExpanded((prior) => {
      const next = new Set(prior);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  return (
    <ul className="divide-y divide-border">
      {evidence.map((entry, index) => {
        const isExpanded = expanded.has(index);
        return (
          <li key={index}>
            <button
              type="button"
              aria-label={`Evidence row ${index + 1}`}
              aria-expanded={isExpanded}
              onClick={() => toggle(index)}
              className="flex w-full gap-2 rounded-sm py-1.5 text-left select-text hover:bg-state-hover focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="text-[13px] leading-5 text-muted-foreground tabular-nums">
                {index + 1}
              </span>
              <span
                className={cn(
                  "min-w-0 text-[13px] leading-5 break-words whitespace-pre-wrap text-foreground",
                  "max-w-[736px]",
                  !isExpanded && "line-clamp-4",
                )}
              >
                {entry}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One row per check, failed checks included: a glyph plus status word, then
 * the check name in semibold and its detail in muted prose.
 */
function ChecksPanel({ checks }: { checks: TaskReport["checks"] }) {
  return (
    <ul className="divide-y divide-border">
      {checks.map((check, index) => {
        const meta = CHECK_STATUS[check.status];
        return (
          <li key={`${check.name}-${index}`} className="space-y-0.5 py-1.5">
            <p
              className={cn(
                "text-[13px] leading-5 font-semibold",
                STATUS_TEXT[meta.color],
              )}
            >
              {`${meta.glyph} ${meta.word}`}
            </p>
            <p className={cn(BODY, "font-semibold")}>{check.name}</p>
            <p className={cn(BODY, "text-muted-foreground")}>{check.detail}</p>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Findings sorted blocking first, one row per finding: the severity word in
 * its status color, the owning task (collapsed findings omit `taskId` because
 * they are about the reporting task itself), the display paths such as
 * `src/api.ts:41`, the defect summary, and the suggested fix when the reviewer
 * supplied one. `compact` clamps long text.
 */
export function FindingsPanel({
  findings,
  compact = false,
}: {
  findings: readonly TaskFinding[];
  compact?: boolean;
}) {
  const muted = cn("text-xs leading-[18px] text-muted-foreground", PROSE_CLASS);
  return (
    <ul className="divide-y divide-border">
      {sortedFindings(findings).map((finding, index) => {
        const meta = FINDING_SEVERITY[finding.severity];
        return (
          <li key={`${finding.id}-${index}`} className="space-y-0.5 py-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "text-[13px] leading-5 font-semibold",
                  STATUS_TEXT[meta.color],
                )}
              >
                {`${meta.glyph} ${meta.word} · ${finding.id}`}
              </span>
              {finding.taskId && (
                <span className="text-xs leading-[18px] text-muted-foreground">
                  {`on ${finding.taskId}`}
                </span>
              )}
            </div>
            {finding.paths.length > 0 && (
              <p className={cn(muted, "font-mono", compact && "truncate")}>
                {finding.paths.join(", ")}
              </p>
            )}
            <p className={cn(BODY, compact && "line-clamp-3")}>
              {finding.summary}
            </p>
            {finding.suggestedFix && (
              <p className={cn(muted, compact && "line-clamp-2")}>
                {`Suggested fix: ${finding.suggestedFix}`}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
