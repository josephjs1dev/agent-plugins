import type { Usage } from "essentials/usage";
import { formatResetTime, remainingPercent } from "essentials/usage-display";
import { cn } from "@/lib/utils";

function statusClass(remaining: number): string {
  if (remaining <= 10) {
    return "bg-destructive";
  }
  if (remaining <= 30) {
    return "bg-amber-500";
  }
  return "bg-emerald-500";
}

/** One quota window: remaining share and reset time. */
export function QuotaWindow({ quota }: { quota: Usage["windows"][number] }) {
  const remaining = remainingPercent(quota.usedPercent);
  const left = `${Math.round(remaining)}% left`;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate text-sm font-semibold">
          {quota.name}
        </span>
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            statusClass(remaining),
          )}
        />
      </div>
      <div
        role="progressbar"
        aria-label={`${quota.name} remaining`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(remaining)}
        aria-valuetext={left}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-foreground"
          style={{ width: `${remaining}%` }}
        />
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>{left}</span>
        <span>{formatResetTime(quota.resetsAt)}</span>
      </div>
    </div>
  );
}
