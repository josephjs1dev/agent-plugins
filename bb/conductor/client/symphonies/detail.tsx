import { useState } from "react";
import type {
  StoredSymphony,
  SymphonyContext,
} from "conductor/symphonies/models";
import { symphonyMetrics } from "conductor/symphonies/metrics";
import {
  historyLoops,
  scoreAtLoop,
  symphonyAtLoop,
  unresolvedItemLabel,
} from "conductor/podium/history";
import { previewLines } from "conductor/podium/report";
import { symphonyStatusPresentation } from "conductor/podium/status";
import {
  DETAIL_VIEWS,
  DETAIL_VIEW_ICONS,
  detailProgress,
  detailViewLabel,
  loopNote,
  metricsLine,
  resultLabel,
  type DetailView,
} from "conductor/podium/symphony-detail";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { bbIconName } from "../ui/icon-names";
import { Notice, SectionLabel } from "../ui/notice";
import { SymphonyProgress } from "../ui/progress";
import { StatusMarker } from "../ui/status";
import { SymphonyDeleteAction } from "./delete-action";
import { SymphonyInspection } from "./inspection";
import type { ProfilesData } from "./list";
import { LoopSelector } from "./loop-selector";
import {
  SymphonyTaskCard,
  type TaskDisclosure,
  type TaskDisclosures,
} from "./task-card";

export function SymphonyDetail({
  symphony,
  context,
  stale,
  compact = false,
  openAgent,
  deleteSymphony,
  profiles,
}: {
  symphony: StoredSymphony;
  context: SymphonyContext;
  stale: boolean;
  compact?: boolean;
  openAgent?: (id: string) => void;
  deleteSymphony?: (symphony: StoredSymphony) => Promise<void>;
  /** Worker profiles and provider catalog, for worker identity labels. */
  profiles?: ProfilesData;
}) {
  const [view, setView] = useState<DetailView>("tasks");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // null follows the latest loop as new loops start.
  const [pickedLoop, setPickedLoop] = useState<number | null>(null);
  const score = symphony.revisions.at(-1)?.score ?? { tasks: [] };
  const loops = historyLoops(symphony);
  const latestLoop = loops.at(-1)?.loop ?? 1;
  const shownLoop =
    pickedLoop !== null && pickedLoop < latestLoop ? pickedLoop : latestLoop;
  const multiLoop = loops.length > 1;
  // Tasks, Graph and Context show the chosen loop; History always shows all.
  const loopSymphony = symphonyAtLoop(symphony, shownLoop);
  const loopScore = multiLoop ? scoreAtLoop(symphony, shownLoop) : score;
  const conducting = symphony.execution.conducting;
  const planning = conducting?.phase === "planning";
  const progress = detailProgress(symphony);
  const metrics = symphonyMetrics(symphony, Date.now());
  const sourceAgent = symphony.source.agentId;
  const unresolved = symphony.execution.unresolved ?? [];
  const isOpen = (key: string) => Boolean(expanded[key]);
  const taskDisclosures = (taskId: string): TaskDisclosures => ({
    summary: isOpen(`summary-${taskId}`),
    instructions: isOpen(`instructions-${taskId}`),
    evidence: isOpen(`evidence-${taskId}`),
    checks: isOpen(`checks-${taskId}`),
  });
  const toggleTask = (taskId: string, selection: TaskDisclosure) => {
    const key = `${selection}-${taskId}`;
    // Evidence and Checks share one inset panel per card, so opening one
    // closes the other.
    const others: Partial<Record<TaskDisclosure, string>> = {
      evidence: `checks-${taskId}`,
      checks: `evidence-${taskId}`,
    };
    const other = others[selection];
    setExpanded((prior) => ({
      ...prior,
      [key]: !prior[key],
      ...(other ? { [other]: false } : {}),
    }));
  };
  return (
    <article
      aria-labelledby="symphony-detail-title"
      className={cn("space-y-4", compact ? "p-4" : "p-6")}
    >
      <header className="space-y-1.5">
        <StatusMarker
          presentation={symphonyStatusPresentation(symphony.status)}
        />
        <h2
          id="symphony-detail-title"
          className="text-xl font-semibold text-foreground"
        >
          {symphony.title}
        </h2>
        <p className="text-xs text-muted-foreground">
          {symphony.source.concertName} ·{" "}
          {symphony.source.branch ?? "Branch unknown"}
          {loopNote(symphony)}
        </p>
        {metrics.attemptCount > 0 && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {metricsLine(metrics)}
          </p>
        )}
      </header>
      <SymphonyProgress
        completedTasks={progress.completed}
        taskCount={progress.taskCount}
        planning={planning}
        {...(planning ? {} : { segments: progress.segments })}
      />
      {stale && (
        <Notice warning>
          Symphony refresh failed. Showing the last saved state.
        </Notice>
      )}
      {symphony.execution.interruption && (
        <Notice warning>{symphony.execution.interruption}</Notice>
      )}
      {planning && (
        <Notice>
          The Conductor agent is planning this symphony. It will define tasks
          with dependencies, then dispatch task agents; tasks and reports appear
          here as agents are launched.
          {conducting?.conductorLaunch === "pending"
            ? " The Conductor agent is still being created."
            : ""}
        </Notice>
      )}
      {symphony.execution.summary && (
        <ResultSummary label={resultLabel(symphony)}>
          {symphony.execution.summary}
        </ResultSummary>
      )}
      {unresolved.length > 0 && (
        <section className="space-y-2">
          <SectionLabel>Unresolved</SectionLabel>
          <Notice warning>
            <p>The symphony ended with open work the user chose not to fix:</p>
            <ul className="mt-1 list-disc pl-5">
              {unresolved.map((item, index) => (
                <li key={index}>{unresolvedItemLabel(item)}</li>
              ))}
            </ul>
          </Notice>
        </section>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="Symphony views"
          className="flex min-w-0 shrink gap-1 overflow-x-auto"
        >
          {DETAIL_VIEWS.map((entry) => (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={view === entry}
              onClick={() => setView(entry)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm",
                view === entry
                  ? "bg-state-active font-medium text-foreground"
                  : "text-muted-foreground hover:bg-state-hover hover:text-foreground",
              )}
            >
              <Icon
                name={bbIconName(DETAIL_VIEW_ICONS[entry])}
                fallback="Circle"
                aria-hidden
                className="size-4"
              />
              {detailViewLabel(entry)}
            </button>
          ))}
        </div>
        {((openAgent && sourceAgent) || deleteSymphony) && (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {openAgent && sourceAgent && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openAgent(sourceAgent)}
              >
                <Icon name="ExternalLink" aria-hidden />
                Conductor agent
              </Button>
            )}
            {deleteSymphony && (
              <SymphonyDeleteAction
                symphony={symphony}
                deleteSymphony={deleteSymphony}
              />
            )}
          </div>
        )}
      </div>
      {multiLoop && view !== "history" && (
        <LoopSelector
          loops={loops}
          shown={shownLoop}
          onSelect={setPickedLoop}
        />
      )}
      <SymphonyInspection
        view={view}
        symphony={view === "history" ? symphony : loopSymphony}
        context={context}
        score={view === "history" ? score : loopScore}
        compact={compact}
        {...(profiles ? { profiles } : {})}
        {...(multiLoop ? { loop: shownLoop } : {})}
        {...(openAgent ? { openAgent } : {})}
      />
      {view === "tasks" && (
        <div className="space-y-3">
          {!score.tasks.length && !planning && (
            <Notice>No tasks were recorded.</Notice>
          )}
          {loopScore.tasks.map((task) => (
            <SymphonyTaskCard
              key={task.id}
              symphony={loopSymphony}
              task={task}
              profiles={profiles?.state?.profiles ?? []}
              catalog={profiles?.providers}
              compact={compact}
              {...(multiLoop ? { loop: shownLoop } : {})}
              disclosures={taskDisclosures(task.id)}
              onToggle={(selection) => toggleTask(task.id, selection)}
              {...(openAgent ? { openAgent } : {})}
            />
          ))}
        </div>
      )}
    </article>
  );
}

/**
 * The reported result in its own quiet card: the attribution heading and a
 * preview of its first lines. Whether a line overflows depends on pane width,
 * so every nonempty result offers Show more instead of guessing.
 */
function ResultSummary({
  label,
  children,
}: {
  label: string;
  children: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const lines = previewLines(children);
  return (
    <section className="space-y-2 rounded-lg border border-border bg-muted/30 p-3.5">
      <div className="flex items-center gap-1.5">
        <Icon
          name="FileText"
          aria-hidden
          className="size-3.5 text-muted-foreground"
        />
        <SectionLabel>{label}</SectionLabel>
      </div>
      {expanded ? (
        <p className="max-w-[760px] text-sm whitespace-pre-wrap text-foreground">
          {children}
        </p>
      ) : (
        <div className="space-y-1.5">
          {lines.length === 0 ? (
            <p className="max-w-[760px] text-sm text-foreground">{children}</p>
          ) : (
            lines.map((line, index) => (
              <p
                key={index}
                className="max-w-[760px] truncate text-sm text-foreground"
              >
                {line}
              </p>
            ))
          )}
          <Button variant="ghost" size="sm" onClick={() => setExpanded(true)}>
            Show more
          </Button>
        </div>
      )}
    </section>
  );
}
