import { ageLabel } from "conductor/agents/attention";
import type { SymphonyListEntry } from "conductor/symphonies/models";
import { symphonyStatusPresentation } from "conductor/podium/status";
import { symphonyCaption } from "conductor/podium/symphony-list";
import { cn } from "@/lib/utils";
import { SymphonyProgress } from "../ui/progress";
import { StatusMarker } from "../ui/status";

/**
 * One symphony card in the list: status with age, title, concert context with
 * the reported-task count, a compact progress track, then the result or
 * blocker preview. The count and track describe reported completions only,
 * and planning symphonies omit the track instead of showing a percentage.
 */
export function SymphonyRow({
  symphony,
  now,
  selected,
  onSelect,
}: {
  symphony: SymphonyListEntry;
  now: number;
  selected: boolean;
  onSelect(this: void): void;
}) {
  const planning = symphony.status === "planning";
  return (
    <button
      type="button"
      aria-label={`Open symphony: ${symphony.title}`}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col gap-1 rounded-lg border px-3 py-2 text-left transition-colors",
        "focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
        selected
          ? "border-foreground/40 bg-state-active"
          : "border-border bg-background hover:bg-state-hover",
      )}
    >
      <span className="flex items-center justify-between gap-3">
        <StatusMarker
          presentation={symphonyStatusPresentation(symphony.status)}
        />
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {ageLabel(new Date(symphony.updatedAt).toISOString(), now)}
        </span>
      </span>
      <span className="line-clamp-2 text-sm font-semibold text-foreground">
        {symphony.title}
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {symphonyCaption(symphony)}
      </span>
      {!planning && symphony.taskCount > 0 && (
        <SymphonyProgress
          completedTasks={symphony.completedTasks}
          taskCount={symphony.taskCount}
          showLabel={false}
        />
      )}
      {symphony.message && (
        <span className="line-clamp-2 text-xs text-muted-foreground">
          {symphony.message}
        </span>
      )}
    </button>
  );
}
