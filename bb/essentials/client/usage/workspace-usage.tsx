import { useState } from "react";
import { providerDefinitions, type Provider } from "essentials/providers";
import {
  compactTokens,
  formatCostEstimate,
  sessionKey,
  totalTokens,
} from "essentials/history-display";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { ICONS } from "../../shared/icons";
import type { Output } from "../data";
import { useOpenHistory } from "../navigation";
import { ProviderMark, ProviderSwitcher } from "./provider-mark";
import { ModelUsage, SessionUsage } from "./usage-rows";
import { useWorkspaceHistory } from "./use-workspace-history";

type History = Output<"usage.history">;

function Totals({
  data,
  days,
  providerName,
}: {
  data: History;
  days: 7 | 30;
  providerName: string;
}) {
  const { workspaceTotals: totals, workspaceSessionCount: sessions } = data;
  return (
    <div className="space-y-4 rounded-lg bg-muted/50 p-4">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          {providerName} · last {days} days
        </p>
        <p className="flex flex-wrap items-baseline gap-2">
          <span className="select-text text-3xl font-semibold tabular-nums">
            {compactTokens(totalTokens(totals))}
          </span>
          <span className="text-sm text-muted-foreground">tokens</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {sessions} {sessions === 1 ? "session" : "sessions"} in this
          environment
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-4 border-t pt-4">
        {[
          { label: "Input", value: totals.input },
          { label: "Output", value: totals.output },
          { label: "Cache reads", value: totals.cached },
        ].map(({ label, value }) => (
          <div key={label} className="space-y-1">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="select-text font-medium tabular-nums">
              {compactTokens(value)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        Cache reads are included in input.
      </p>
      {(totals.costEstimate !== undefined || totals.cost !== null) && (
        <div className="flex justify-between gap-4 text-sm">
          <span>Estimated cost</span>
          <span className="tabular-nums">{formatCostEstimate(totals)}</span>
        </div>
      )}
    </div>
  );
}

function Empty({
  provider,
  title,
  message,
}: {
  provider: Provider;
  title: string;
  message: string;
}) {
  return (
    <div className="space-y-4 rounded-lg bg-muted/50 p-4">
      <ProviderMark
        provider={provider}
        className="size-7 text-muted-foreground"
      />
      <div aria-live="polite" className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

/** Usage of the sessions that ran in this thread's environment. */
export function WorkspaceUsage({
  threadId,
  onClose,
}: {
  threadId: string;
  onClose(this: void): void;
}) {
  const [provider, setProvider] = useState<Provider>("chatgpt");
  const [days, setDays] = useState<7 | 30>(7);
  const { data, error, refreshing, refresh } = useWorkspaceHistory(
    threadId,
    provider,
    days,
  );
  const openHistory = useOpenHistory();
  const providerName = providerDefinitions[provider].name;
  const hasSessions = data !== null && data.workspaceSessionCount > 0;
  const partial = Boolean(data?.warning);
  let emptyTitle = `No ${providerName} usage yet`;
  let emptyMessage = `Usage from ${providerName} sessions in this environment will appear here. Try a longer time range or refresh after a session.`;
  if (refreshing) {
    emptyTitle = "Reading session history…";
    emptyMessage = "Checking local sessions on the bb host.";
  } else if (partial) {
    emptyTitle = "History is incomplete";
    emptyMessage =
      data?.warning ||
      "Some local records could not be read. Try refreshing to check again.";
  }
  return (
    <div className="space-y-5">
      <h3 className="text-base font-semibold">Workspace usage</h3>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ProviderSwitcher value={provider} onChange={setProvider} />
        <div role="group" aria-label="Time period" className="flex gap-1">
          {([7, 30] as const).map((range) => (
            <button
              key={range}
              type="button"
              aria-pressed={days === range}
              onClick={() => setDays(range)}
              className={cn(
                "h-8 rounded-md px-3 text-sm text-muted-foreground hover:bg-state-hover",
                days === range && "bg-state-active text-foreground",
              )}
            >
              {range}d
            </button>
          ))}
        </div>
      </div>
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {data
            ? "Could not refresh history. Showing the last available records."
            : "Could not load workspace usage. Check the bb host's connection and try refreshing."}
        </p>
      )}
      {partial && hasSessions && (
        <p className="text-xs text-muted-foreground">{data?.warning}</p>
      )}
      {hasSessions && data && (
        <>
          <Totals data={data} days={days} providerName={providerName} />
          <section className="space-y-2">
            <h4 className="text-sm font-semibold">Models</h4>
            <ModelUsage key={provider} models={data.workspaceModels} />
          </section>
          <section className="space-y-2">
            <h4 className="text-sm font-semibold">Recent sessions</h4>
            <p className="text-xs text-muted-foreground">
              Latest 5 · select for token details
            </p>
            <div>
              {data.sessions.slice(0, 5).map((session) => (
                <SessionUsage key={sessionKey(session)} session={session} />
              ))}
            </div>
          </section>
        </>
      )}
      {!hasSessions && error === null && (
        <Empty provider={provider} title={emptyTitle} message={emptyMessage} />
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 text-xs text-muted-foreground">
          {data?.scannedAt
            ? `Local history · ${new Date(data.scannedAt).toLocaleTimeString()}`
            : "Local session history on the bb host"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={refreshing}
          onClick={refresh}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      <button
        type="button"
        onClick={() => {
          onClose();
          openHistory(provider, days, "workspace");
        }}
        className="flex min-h-10 w-full items-center justify-between gap-3 border-t pt-3 text-sm font-medium"
      >
        Open usage history
        <Icon
          name={ICONS.open}
          aria-hidden
          className="size-4 text-muted-foreground"
        />
      </button>
    </div>
  );
}
