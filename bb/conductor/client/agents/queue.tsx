import { useLayoutEffect, useRef } from "react";
import type { AgentItem } from "conductor/agents/models";
import { ageLabel } from "conductor/agents/attention";
import { queueGroups } from "conductor/agents/hierarchy";
import { agentWorker } from "conductor/podium/agents";
import {
  cardDelivery,
  cardLabel,
  cardMeta,
  cardParent,
  itemTitle,
  workerLabel,
} from "conductor/podium/agents-view";
import { agentStatusPresentation } from "conductor/podium/status";
import type { ProviderCatalog } from "conductor/symphonies/profiles-contracts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SectionLabel } from "../ui/notice";
import { StatusMarker } from "../ui/status";

/** Indentation per nesting level, capped at three levels as in Paseo. */
const DEPTH_INDENT = ["", "ml-8", "ml-16", "ml-24"];

interface Props {
  items: AgentItem[];
  now: number;
  selectedKey: string | null;
  groupBy: "project" | "concert";
  catalog: ProviderCatalog | undefined;
  onSelect(this: void, item: AgentItem): void;
  /** The queue's scroll offset, kept across remounts of the section. */
  scroll: { offset: number };
  emptyTitle: string;
  emptyDescription: string;
  showAll: boolean;
  onShowAll(this: void): void;
}

/**
 * The Agents queue: project or concert groups of cards, children nested
 * under their parents. Agents never show a progress track: their snapshots
 * cannot establish task completion.
 */
export function Queue({
  items,
  now,
  selectedKey,
  groupBy,
  catalog,
  onSelect,
  scroll,
  emptyTitle,
  emptyDescription,
  showAll,
  onShowAll,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = scroll.offset;
    }
    // Restore once on mount; later offsets come from the scroll handler.
  }, []);
  const groups = queueGroups(items, groupBy);
  return (
    <div
      ref={ref}
      data-testid="agents-queue"
      onScroll={(event) => {
        scroll.offset = event.currentTarget.scrollTop;
      }}
      className="h-full min-h-0 space-y-4.5 overflow-y-auto p-3.5"
    >
      {items.length === 0 && (
        <div className="space-y-2.5 p-5">
          <p className="text-base font-medium">{emptyTitle}</p>
          <p className="text-sm text-muted-foreground">{emptyDescription}</p>
          {showAll && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onShowAll}
            >
              View all agents
            </Button>
          )}
        </div>
      )}
      {groups.map(({ label, entries }) => (
        <section key={label} aria-label={label} className="space-y-2">
          <div className="px-3">
            <SectionLabel>{label}</SectionLabel>
          </div>
          <ul className="space-y-2">
            {entries.map(({ item, depth }) => (
              <li key={item.key} className={DEPTH_INDENT[Math.min(depth, 3)]}>
                <AgentCard
                  item={item}
                  now={now}
                  selected={item.key === selectedKey}
                  depth={depth}
                  catalog={catalog}
                  onSelect={onSelect}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * One queue card. Hover swaps the fill only; the border marks selection and
 * keyboard focus without relying on the fill alone.
 */
function AgentCard({
  item,
  now,
  selected,
  depth,
  catalog,
  onSelect,
}: {
  item: AgentItem;
  now: number;
  selected: boolean;
  depth: number;
  catalog: ProviderCatalog | undefined;
  onSelect(this: void, item: AgentItem): void;
}) {
  const worker = agentWorker(item, catalog);
  const parent = cardParent(item, depth);
  const delivery = cardDelivery(item);
  return (
    <button
      type="button"
      data-testid={`item-${item.key}`}
      aria-label={cardLabel(item)}
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect(item)}
      className={cn(
        "block w-full space-y-1 rounded-lg border px-3 py-2 text-left shadow-xs hover:bg-state-hover focus-visible:border-foreground focus-visible:bg-state-hover focus-visible:outline-none",
        selected
          ? "border-foreground bg-state-active"
          : "border-border bg-background",
      )}
    >
      <span className="flex items-center justify-between gap-3">
        <StatusMarker presentation={agentStatusPresentation(item)} />
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {ageLabel(item.since, now)}
        </span>
      </span>
      <span className="line-clamp-2 text-sm font-semibold">
        {itemTitle(item)}
      </span>
      <span
        data-testid={`worker-${item.agentId}`}
        className="block truncate text-xs"
      >
        {workerLabel(worker)}
      </span>
      <span className="block truncate text-xs text-muted-foreground">
        {cardMeta(item, now)}
      </span>
      {parent && (
        <span className="block truncate text-xs text-muted-foreground">
          {parent}
        </span>
      )}
      {delivery && (
        <span className="block text-xs text-amber-600 dark:text-amber-400">
          {delivery}
        </span>
      )}
    </button>
  );
}
