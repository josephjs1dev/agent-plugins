import { useEffect, useState } from "react";
import type { Provider } from "essentials/providers";
import { estimatedCost } from "essentials/history-display";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { CLAUDE_RATE_DATE } from "essentials/claude-cost";
import { CODEX_RATE_DATE } from "essentials/codex-cost-estimate";
import { ICONS } from "../../shared/icons";
import { ModelUsage } from "./breakdown";
import { HistoryChart, type ChartMetric } from "./chart";
import { ChoiceGroup, HistorySection } from "./controls";
import { useHistory, validSessionOffset } from "./query";
import { HistorySessions } from "./sessions";
import { UsageSummary } from "./totals";
import type { HistorySelection } from "./view";

function costNote(selection: HistorySelection, hasCost: boolean): string {
  if (selection.provider === "chatgpt") {
    return `Estimated costs use Standard API USD rates checked ${CODEX_RATE_DATE}. Long-context, speed, and plan adjustments are excluded. Partial estimates cover priced models only; they are not billed charges.`;
  }
  if (selection.provider === "claude") {
    return `Estimated costs use published API rates checked ${CLAUDE_RATE_DATE}. They are not billed charges.`;
  }
  return hasCost
    ? "Estimated costs use recorded model prices and may differ from your subscription bill."
    : "";
}

/** The Refresh control, disabled while a rescan runs. */
export function RefreshButton({
  refreshing,
  onRefresh,
}: {
  refreshing: boolean;
  onRefresh(): void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={refreshing}
      aria-label="Refresh usage history"
      onClick={onRefresh}
    >
      <Icon name={ICONS.reset} aria-hidden />
      {refreshing ? "Refreshing…" : "Refresh"}
    </Button>
  );
}

/** True when any day of the period has a cost estimate to chart. */
export function hasDailyCost(
  provider: Provider,
  daily: readonly { totals: Parameters<typeof estimatedCost>[0] }[],
): boolean {
  return (
    provider === "chatgpt" ||
    daily.some((day) => estimatedCost(day.totals) !== null)
  );
}

/** One provider and period of history, with its own session page. */
export function HistoryResults({
  selection,
  compact,
}: {
  selection: HistorySelection;
  compact: boolean;
}) {
  const { provider, days } = selection;
  const [sessionOffset, setSessionOffset] = useState(0);
  const [metric, setMetric] = useState<ChartMetric>(
    provider === "chatgpt" ? "cost" : "tokens",
  );
  const history = useHistory({ provider, days, sessionOffset });
  const { data } = history;
  useEffect(() => {
    if (data) {
      const offset = validSessionOffset(sessionOffset, data.sessionCount);
      if (offset !== sessionOffset) {
        setSessionOffset(offset);
      }
    }
  }, [data, sessionOffset]);
  const periodLabel = `${days} days`;
  const totals = data?.totals;
  const daily = data?.daily ?? [];
  const hasCost = hasDailyCost(provider, daily);
  const activeMetric = metric === "cost" && !hasCost ? "tokens" : metric;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {data?.scannedAt
            ? `Scanned ${new Date(data.scannedAt).toLocaleString()}`
            : "Not scanned yet"}
        </p>
        <RefreshButton
          refreshing={history.isRefreshing}
          onRefresh={history.refresh}
        />
      </div>
      {history.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading usage history…
        </p>
      )}
      {history.error && (
        <p role="alert" className="text-sm text-destructive">
          History could not be refreshed. Use Refresh to try again.
        </p>
      )}
      {data?.warning && (
        <p
          role="alert"
          className="rounded-md border border-amber-500/60 bg-muted/40 p-3 text-sm"
        >
          History may be incomplete. {data.warning}
        </p>
      )}
      {data && totals && (
        <>
          <UsageSummary totals={totals} showCost={hasCost} />
          <HistorySection
            title="Activity"
            description={periodLabel}
            trailing={
              hasCost ? (
                <ChoiceGroup<ChartMetric>
                  label="Chart metric"
                  value={activeMetric}
                  onChange={setMetric}
                  choices={[
                    { value: "tokens", label: "Tokens" },
                    { value: "cost", label: "Estimated cost" },
                  ]}
                />
              ) : undefined
            }
          >
            <HistoryChart data={data} days={days} metric={activeMetric} />
          </HistorySection>
          <HistorySection
            title="Models"
            description={`${periodLabel} · ${data.sessionCount} sessions`}
          >
            <ModelUsage
              models={data.models}
              compact={compact}
              emptyMessage={`No model usage recorded. ${periodLabel}.`}
            />
          </HistorySection>
          <HistorySessions
            sessions={data.sessions}
            sessionCount={data.sessionCount}
            scopeLabel={periodLabel}
            showDirectory
            sessionOffset={sessionOffset}
            onPageChange={setSessionOffset}
          />
          <p className="text-xs text-muted-foreground">
            Times are grouped by UTC day. History is retained for 90 days.{" "}
            {costNote(selection, hasCost)}
          </p>
        </>
      )}
    </div>
  );
}
