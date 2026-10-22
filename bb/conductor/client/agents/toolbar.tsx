import { useState } from "react";
import type { AgentItem, AgentsSnapshot } from "conductor/agents/models";
import { visibleItems } from "conductor/agents/attention";
import { AGENT_FILTERS } from "conductor/podium/agents";
import {
  AGENTS_COPY,
  agentCoverage,
  receiptLine,
  refreshStamp,
  scopedAgentCount,
  showSnoozedToggle,
} from "conductor/podium/agents-view";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { usePodium, useViewState } from "../podium/context";
import { Notice, SectionLabel } from "../ui/notice";

/** The core's Lucide filter icons as bb icon names. */
const FILTER_ICONS: Record<string, string> = {
  Bell: "BellDot",
  Activity: "Loading",
  CirclePause: "Pause",
  ListChecks: "Check",
};

interface Props {
  data: AgentsSnapshot | null;
  stale: boolean;
  now: number;
  compact: boolean;
  hasSelection: boolean;
  hasNext: boolean;
  onNext(this: void): void;
  onRefresh(this: void): void;
  /** Called when the filter changes, so the queue scrolls back to the top. */
  onFilterChange(this: void): void;
}

/**
 * The Agents toolbar: coverage, refresh and next item; the snapshot's
 * notices; then filters, search, grouping and recent deliveries. A narrow
 * layout with a selection shows a back control instead of the queue tools.
 */
export function AgentsToolbar(props: Props) {
  const { data, stale, now, compact, hasSelection } = props;
  const { session } = usePodium();
  const state = useViewState();
  const [showHistory, setShowHistory] = useState(false);
  const items: AgentItem[] = data?.items ?? [];
  const agentCount = scopedAgentCount(items, undefined);
  const reliable = Boolean(data) && !stale;
  return (
    <div className="space-y-3 border-b border-border px-4 pt-3 pb-3 md:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          data-testid="agent-coverage"
          className="text-xs text-muted-foreground"
        >
          bb · All concerts
          {data
            ? ` · ${agentCoverage(agentCount, data.incomplete, stale)}`
            : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {compact && hasSelection && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => session.update({ selectedKey: null })}
            >
              <Icon name="ArrowLeft" aria-hidden />
              Back to queue
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={props.onRefresh}
          >
            <Icon name="RotateCcw" aria-hidden />
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!props.hasNext}
            onClick={props.onNext}
          >
            Next item
            <Icon name="ArrowRight" aria-hidden />
          </Button>
        </div>
      </div>
      {stale && <Notice warning>{AGENTS_COPY.stale}</Notice>}
      {data?.incomplete && <Notice warning>{AGENTS_COPY.incomplete}</Notice>}
      {data?.concertIncomplete && (
        <Notice>{AGENTS_COPY.concertIncomplete}</Notice>
      )}
      {data?.turnHistoryIncomplete && (
        <Notice warning>{AGENTS_COPY.turnHistoryIncomplete}</Notice>
      )}
      {(!compact || !hasSelection) && (
        <>
          <div
            role="group"
            aria-label="Agent filters"
            className="flex gap-1 overflow-x-auto border-b border-border"
          >
            {AGENT_FILTERS.map((filter) => {
              const selected = state.filter === filter.id;
              const count = reliable
                ? visibleItems(
                    items,
                    filter.id,
                    "",
                    undefined,
                    now,
                    state.showSnoozed,
                  ).length
                : null;
              return (
                <button
                  key={filter.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    session.update({ filter: filter.id, selectedKey: null });
                    props.onFilterChange();
                  }}
                  className={cn(
                    "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2 text-sm whitespace-nowrap focus-visible:bg-state-hover focus-visible:outline-none",
                    selected
                      ? "border-foreground font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon
                    name={FILTER_ICONS[filter.icon] ?? filter.icon}
                    fallback="Circle"
                    aria-hidden
                    className="size-4"
                  />
                  {filter.label}
                  {count !== null && (
                    <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div
            data-testid="podium-tools"
            className="flex flex-wrap items-center gap-2"
          >
            <div className="relative min-w-60 flex-1">
              <Icon
                name="Search"
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                aria-label="Search agents and requests"
                placeholder="Search agents, requests, concerts…"
                value={state.query}
                onChange={(event) =>
                  session.update({ query: event.target.value })
                }
                className="h-8 pl-8 text-sm"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                session.update({
                  groupBy: state.groupBy === "project" ? "concert" : "project",
                })
              }
            >
              {state.groupBy === "project"
                ? "Group: project"
                : "Group: concert"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={showHistory}
              onClick={() => setShowHistory(!showHistory)}
            >
              {showHistory ? "Hide recent actions" : "Recent actions"}
            </Button>
            {showSnoozedToggle(state.filter, state.showSnoozed, items, now) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={state.showSnoozed}
                onClick={() =>
                  session.update({ showSnoozed: !state.showSnoozed })
                }
              >
                Show snoozed
              </Button>
            )}
          </div>
        </>
      )}
      {data && (
        <p className="text-[11px] text-muted-foreground">
          {refreshStamp(stale, data.fetchedAt)}
        </p>
      )}
      {showHistory && (
        <div className="space-y-2">
          <SectionLabel>Recent response delivery</SectionLabel>
          {data?.receipts.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {AGENTS_COPY.noReceipts}
            </p>
          )}
          {data && data.receipts.length > 0 && (
            <ul className="space-y-1 text-xs">
              {data.receipts.slice(0, 5).map((receipt) => (
                <li key={receipt.key}>{receiptLine(receipt, data.items)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
