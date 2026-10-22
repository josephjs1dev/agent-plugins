import {
  progressFraction,
  progressLabel,
  segmentLabel,
  type SymphonyProgressSegment,
} from "conductor/podium/progress";
import { cn } from "@/lib/utils";

/**
 * Reported-task progress. It counts equal tasks, never effort or time, and a
 * full track does not claim the symphony is complete.
 */
export function SymphonyProgress({
  completedTasks,
  taskCount,
  planning = false,
  showLabel = true,
  segments,
}: {
  completedTasks: number;
  taskCount: number;
  planning?: boolean;
  showLabel?: boolean;
  segments?: readonly SymphonyProgressSegment[];
}) {
  if (planning) {
    return showLabel ? (
      <p className="text-xs text-muted-foreground">Splitting into tasks</p>
    ) : null;
  }
  const label = progressLabel(completedTasks, taskCount);
  return (
    <div className="space-y-1.5" aria-label={label}>
      {showLabel && <p className="text-xs text-muted-foreground">{label}</p>}
      {taskCount > 0 && segments && (
        <div className="flex gap-0.5">
          {segments.map((segment) => (
            <div
              key={segment.id}
              aria-label={segmentLabel(segment)}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                segment.reportedComplete ? "bg-emerald-500" : "bg-muted",
              )}
            />
          ))}
        </div>
      )}
      {taskCount > 0 && !segments && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{
              width: `${progressFraction(completedTasks, taskCount) * 100}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}
