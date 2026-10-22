import {
  SYMPHONY_FILTERS,
  symphonyCountLabel,
  visibleSymphonies,
} from "conductor/podium/symphony-list";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { usePodium, useViewState } from "../podium/context";
import { bbIconName } from "../ui/icon-names";
import type { SymphoniesData } from "./list";

/**
 * The section header: scope and symphony count, Back on a narrow pane with a
 * selection, and Refresh.
 */
export function SymphonyHeader({
  data,
  compact,
  refresh,
}: {
  data: SymphoniesData;
  compact: boolean;
  refresh(this: void): void;
}) {
  const { session } = usePodium();
  const state = useViewState();
  const count = visibleSymphonies(data.list?.symphonies ?? [], {
    ...state,
    symphonyQuery: "",
    symphonyFilter: "all",
  }).length;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">
        All concerts
        {data.list
          ? ` · ${symphonyCountLabel(count)}${data.stale ? " · last known" : ""}`
          : ""}
      </p>
      <div className="flex items-center gap-1">
        {compact && state.symphonySelection && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => session.update({ symphonySelection: null })}
          >
            <Icon name="ArrowLeft" aria-hidden />
            Back to symphonies
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          aria-label="Refresh symphonies"
          onClick={refresh}
        >
          <Icon name="RotateCcw" aria-hidden />
          Refresh
        </Button>
      </div>
    </div>
  );
}

/** Status filters with counts, then the symphony search. */
export function SymphonyToolbar({ data }: { data: SymphoniesData }) {
  const { session } = usePodium();
  const state = useViewState();
  const reliable =
    data.list && !data.stale && !data.list.incomplete && !data.list.unavailable;
  return (
    <>
      <div
        role="group"
        aria-label="Symphony status"
        className="flex gap-1 overflow-x-auto border-b border-border"
      >
        {SYMPHONY_FILTERS.map(({ id, label, icon }) => {
          const selected = state.symphonyFilter === id;
          const count = reliable
            ? visibleSymphonies(data.list?.symphonies ?? [], {
                ...state,
                symphonyFilter: id,
                symphonyQuery: "",
              }).length
            : null;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                session.update({ symphonyFilter: id, symphonySelection: null })
              }
              className={cn(
                "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2 text-sm",
                selected
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon
                name={bbIconName(icon)}
                fallback="Circle"
                aria-hidden
                className="size-4"
              />
              {label}
              {count !== null && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="relative">
        <Icon
          name="Search"
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label="Search symphonies"
          placeholder="Search symphonies, projects, or concerts…"
          value={state.symphonyQuery}
          onChange={(event) =>
            session.update({ symphonyQuery: event.target.value })
          }
          className="pl-8"
        />
      </div>
    </>
  );
}
