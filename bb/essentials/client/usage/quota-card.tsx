import { providerDefinitions, type Provider } from "essentials/providers";
import { creditBalanceLabel } from "essentials/usage-display";
import { Button } from "@/components/ui/button";
import { CodexReset } from "./codex-reset";
import { QuotaWindow } from "./quota-window";
import { UsageUnavailable } from "./usage-unavailable";
import type { UsageQuery } from "./use-usage";

const HOST_UNAVAILABLE =
  "Could not reach the bb host. Check its connection and try again.";

/** One provider's remaining quota with credits, resets, and refresh. */
export function QuotaCard({
  provider,
  query,
}: {
  provider: Provider;
  query: UsageQuery;
}) {
  const { usage, loading, refreshing, error, refresh, set } = query;
  const unavailable =
    usage?.status === "unavailable" || (error !== null && usage === null);
  let footer = "Updates every 5 minutes";
  if (usage) {
    const time = new Date(usage.checkedAt).toLocaleTimeString();
    footer = `${unavailable ? "Last checked" : "Updated"} ${time}`;
  }
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h3 className="text-base font-semibold">Remaining quota</h3>
        <p className="text-xs text-muted-foreground">
          {providerDefinitions[provider].name} · all sessions
        </p>
      </div>
      {loading && (
        <p className="text-sm text-muted-foreground">Loading usage…</p>
      )}
      {error !== null && usage?.status === "ok" && (
        <p role="alert" className="text-sm text-destructive">
          Could not refresh usage. Showing the previous check, if available.
        </p>
      )}
      {unavailable && (
        <UsageUnavailable
          provider={provider}
          issue={usage?.issue}
          message={usage?.message || HOST_UNAVAILABLE}
          refreshing={refreshing}
          onRetry={refresh}
        />
      )}
      {usage?.windows.map((quota, index) => (
        <QuotaWindow key={quota.name + index} quota={quota} />
      ))}
      {provider === "chatgpt" && usage?.status === "ok" && (
        <div className="space-y-4">
          <div className="flex justify-between gap-4 text-sm">
            <span>Credit balance</span>
            <span className="tabular-nums">
              {creditBalanceLabel(usage.credits)}
            </span>
          </div>
          <CodexReset usage={usage} onUsageChange={set} />
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 text-xs text-muted-foreground">{footer}</span>
        {!unavailable && (
          <Button
            variant="ghost"
            size="sm"
            disabled={refreshing}
            onClick={refresh}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        )}
      </div>
    </div>
  );
}
