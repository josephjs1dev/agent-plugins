import { useState } from "react";
import type { Totals } from "essentials/history";
import {
  compactTokens,
  estimatedCost,
  exactTokens,
  formatCost,
  formatCostEstimate,
  isPartialCost,
  totalTokens,
} from "essentials/history-display";
import { Icon } from "@/components/ui/icon";
import { HistoryValue } from "./controls";

export function hasCostEstimate(totals: Totals): boolean {
  return totals.costEstimate !== undefined || totals.cost !== null;
}

/** Exact input, cached, output, and reasoning counts for one total. */
export function TokenDetails({ totals }: { totals: Totals }) {
  const cachedShare =
    totals.input > 0 ? ((100 * totals.cached) / totals.input).toFixed(1) : "0";
  return (
    <div className="space-y-0.5">
      <HistoryValue label="Input" value={exactTokens(totals.input)} />
      <HistoryValue
        nested
        label={`Cached · ${cachedShare}% of input`}
        value={exactTokens(totals.cached)}
      />
      <HistoryValue label="Output" value={exactTokens(totals.output)} />
      <HistoryValue
        nested
        label="Reasoning · included in output"
        value={exactTokens(totals.reasoning)}
      />
      <HistoryValue
        label="Total tokens"
        value={exactTokens(totalTokens(totals))}
      />
      {hasCostEstimate(totals) && (
        <HistoryValue
          label="Estimated cost"
          value={formatCostEstimate(totals)}
        />
      )}
    </div>
  );
}

function pricedShare(totals: Totals): string | null {
  const estimate = totals.costEstimate;
  if (!estimate || estimate.unpricedTokens <= 0) {
    return null;
  }
  const share = Math.min(
    99.9,
    (100 * estimate.pricedTokens) /
      (estimate.pricedTokens + estimate.unpricedTokens),
  );
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(
    share,
  );
}

/** The headline totals card with an exact-count disclosure. */
export function UsageSummary({
  totals,
  showCost,
}: {
  totals: Totals;
  showCost: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const stats = [
    ...(showCost
      ? [
          {
            label: isPartialCost(totals)
              ? "Estimated cost · partial"
              : "Estimated cost",
            value: formatCost(estimatedCost(totals)),
          },
        ]
      : []),
    { label: "Total tokens", value: compactTokens(totalTokens(totals)) },
    { label: "Input", value: compactTokens(totals.input) },
    { label: "Output", value: compactTokens(totals.output) },
  ];
  const share = pricedShare(totals);
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        {stats.map(({ label, value }, index) => (
          <div key={label} className="min-w-20 flex-1 space-y-1">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd
              className={
                index === 0
                  ? "text-2xl font-semibold tabular-nums select-text"
                  : "text-2xl tabular-nums select-text"
              }
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {share !== null && (
        <p className="mt-3 text-xs text-muted-foreground">
          {share}% of tokens priced. Other models have no published rate.
        </p>
      )}
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <Icon
          name={expanded ? "ChevronDown" : "ChevronRight"}
          className="size-3.5"
          aria-hidden
        />
        Exact token counts
      </button>
      {expanded && (
        <div className="mt-3">
          <TokenDetails totals={totals} />
        </div>
      )}
    </div>
  );
}
