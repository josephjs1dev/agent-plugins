import { useState } from "react";
import type { History, HistoryScope } from "essentials/history";
import {
  bucketLabel,
  compactTokens,
  estimatedCost,
  exactTokens,
  formatCost,
  formatCostEstimate,
  historyBuckets,
  totalTokens,
} from "essentials/history-display";
import { cn } from "@/lib/utils";

export type ChartMetric = "tokens" | "cost";
type Bucket = ReturnType<typeof historyBuckets>[number];

/** Bar area height in pixels. */
const CHART_HEIGHT = 160;

function amount(bucket: Bucket, metric: ChartMetric): number | null {
  return metric === "tokens"
    ? totalTokens(bucket.totals)
    : estimatedCost(bucket.totals);
}

function describe(bucket: Bucket, metric: ChartMetric): string {
  if (!bucket.hasUsage) {
    return "No usage";
  }
  return metric === "tokens"
    ? `${exactTokens(totalTokens(bucket.totals))} tokens`
    : formatCostEstimate(bucket.totals);
}

function Bar({
  value,
  scale,
  hasUsage,
  wide,
}: {
  value: number | null;
  scale: number;
  hasUsage: boolean;
  wide: boolean;
}) {
  if (hasUsage && value === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const positive = value !== null && value > 0;
  return (
    <span
      className={cn(
        "block w-full rounded-t-sm",
        wide ? "max-w-11" : "max-w-6",
        positive ? "bg-primary" : "bg-border",
      )}
      style={{
        height: positive ? Math.max(2, (value / scale) * CHART_HEIGHT) : 2,
      }}
    />
  );
}

/** Daily totals as bars; hover, focus, or click a bar for its value. */
export function HistoryChart({
  data,
  days,
  scope,
  metric,
}: {
  data: History;
  days: 7 | 30;
  scope: HistoryScope;
  metric: ChartMetric;
}) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const daily = scope === "workspace" ? data.workspaceDaily : data.daily;
  const buckets = historyBuckets(daily, days, data.periodEnd);
  const maximum = Math.max(
    0,
    ...buckets.map((bucket) => amount(bucket, metric) ?? 0),
  );
  const format = (value: number) =>
    metric === "tokens" ? compactTokens(value) : formatCost(value);
  const selected =
    buckets.find((bucket) => bucket.startDay === selectedDay) ??
    [...buckets].reverse().find((bucket) => bucket.hasUsage) ??
    buckets[buckets.length - 1];
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div
          aria-hidden
          className="flex w-14 shrink-0 flex-col justify-between text-right text-[11px] text-muted-foreground tabular-nums"
          style={{ height: CHART_HEIGHT }}
        >
          {[maximum, maximum / 2, 0].map((tick, index) => (
            <span key={index}>{format(tick)}</span>
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto pb-2">
          <div
            role="group"
            aria-label="Daily totals"
            className="relative flex"
            style={{ minWidth: days * 28 }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between"
              style={{ height: CHART_HEIGHT }}
            >
              {[0, 1, 2].map((line) => (
                <div key={line} className="h-px bg-border" />
              ))}
            </div>
            {buckets.map((bucket, index) => {
              const isSelected = bucket.startDay === selected?.startDay;
              const label =
                days === 7 || index % 5 === 0 || index === days - 1
                  ? bucket.startDay.slice(8)
                  : "";
              return (
                <button
                  key={bucket.startDay}
                  type="button"
                  aria-label={`${bucket.startDay}: ${describe(bucket, metric)}`}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedDay(bucket.startDay)}
                  onMouseEnter={() => setSelectedDay(bucket.startDay)}
                  onFocus={() => setSelectedDay(bucket.startDay)}
                  className={cn(
                    "relative flex min-w-7 flex-1 cursor-pointer flex-col items-center gap-1.5 rounded px-1",
                    "focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
                    isSelected && "bg-muted/60",
                  )}
                >
                  <span
                    className="flex w-full items-end justify-center"
                    style={{ height: CHART_HEIGHT }}
                  >
                    <Bar
                      value={amount(bucket, metric)}
                      scale={maximum || 1}
                      hasUsage={bucket.hasUsage}
                      wide={days === 7}
                    />
                  </span>
                  <span
                    className={cn(
                      "text-[11px] tabular-nums",
                      isSelected ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {label || " "}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {selected && (
        <p aria-live="polite" className="text-sm select-text">
          {bucketLabel(selected.startDay, selected.endDay)} ·{" "}
          {describe(selected, metric)}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        {bucketLabel(buckets[0]?.startDay ?? data.periodEnd, data.periodEnd)}
        {" · Daily totals · UTC · "}
        {metric === "tokens" ? "tokens" : "estimated USD"}
        {" · Hover or select a bar for details"}
      </p>
    </div>
  );
}
