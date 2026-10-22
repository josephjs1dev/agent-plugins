import { useState, type ReactNode } from "react";
import { harnessDefinitions } from "essentials/harnesses";
import type { History, Totals } from "essentials/history";
import {
  compactTokens,
  formatCostEstimate,
  totalTokens,
} from "essentials/history-display";
import { Icon } from "@/components/ui/icon";
import { bbProvidersOf } from "../../shared/providers";
import { AgentMark } from "../usage/provider-mark";
import { HistoryValue } from "./controls";
import { hasCostEstimate, TokenDetails } from "./totals";

/** A row that expands to show its details below it. */
function ExpandableRow({
  label,
  summary,
  children,
}: {
  label: string;
  summary: ReactNode;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border-b border-border">
      <button
        type="button"
        aria-label={label}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="flex min-h-11 w-full cursor-pointer items-center gap-3 px-2 py-2 text-left hover:bg-muted/40 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
      >
        {summary}
        <Icon
          name={expanded ? "ChevronDown" : "ChevronRight"}
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </button>
      {expanded && (
        <div className="mb-3 space-y-3 rounded-md bg-muted/40 p-3">
          {children}
        </div>
      )}
    </div>
  );
}

const NUMBER = "w-20 shrink-0 text-right text-xs tabular-nums";

export function ModelUsage({
  models,
  compact,
  emptyMessage,
}: {
  models: History["models"];
  /** Hides the input and output columns in a narrow view. */
  compact: boolean;
  emptyMessage: string;
}) {
  const showCost = models.some((entry) => hasCostEstimate(entry.totals));
  if (models.length === 0) {
    return <p className="py-3 text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <div>
      <div className="flex items-center gap-3 border-b border-border px-2 pr-8 pb-1.5 text-[11px] text-muted-foreground">
        <span className="min-w-0 flex-1">Model</span>
        {!compact && (
          <>
            <span className="w-20 text-right">Input</span>
            <span className="w-20 text-right">Output</span>
          </>
        )}
        <span className="w-20 text-right">Tokens</span>
        {showCost && <span className="w-20 text-right">Est. cost</span>}
      </div>
      {models.map(({ model, totals, sessionCount }) => {
        const name = model ?? "Unknown model";
        return (
          <ExpandableRow
            key={JSON.stringify(model)}
            label={`${name} token details`}
            summary={
              <ModelSummary
                name={name}
                totals={totals}
                compact={compact}
                showCost={showCost}
              />
            }
          >
            <HistoryValue label="Sessions" value={String(sessionCount)} />
            <TokenDetails totals={totals} />
          </ExpandableRow>
        );
      })}
    </div>
  );
}

function ModelSummary({
  name,
  totals,
  compact,
  showCost,
}: {
  name: string;
  totals: Totals;
  compact: boolean;
  showCost: boolean;
}) {
  return (
    <>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {name}
      </span>
      {!compact && (
        <>
          <span className={NUMBER}>{compactTokens(totals.input)}</span>
          <span className={NUMBER}>{compactTokens(totals.output)}</span>
        </>
      )}
      <span className={`${NUMBER} font-semibold`}>
        {compactTokens(totalTokens(totals))}
      </span>
      {showCost && <span className={NUMBER}>{formatCostEstimate(totals)}</span>}
    </>
  );
}

export function SessionUsage({
  session,
  showDirectory,
}: {
  session: History["sessions"][number];
  showDirectory: boolean;
}) {
  const harnessName = harnessDefinitions[session.harness].name;
  const date = new Date(session.lastAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const models = session.models
    .map(({ model }) => model ?? "Unknown model")
    .join(", ");
  return (
    <ExpandableRow
      label={`${harnessName} session ${session.sessionId}`}
      summary={
        <>
          <AgentMark
            providerIds={bbProvidersOf(session.harness)}
            label={harnessName}
            className="size-4"
          />
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="block truncate text-sm font-medium">
              {harnessName} · {date} · {session.sessionId.slice(0, 16)}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {models}
            </span>
            {showDirectory && (
              <span className="block truncate text-xs text-muted-foreground">
                {session.cwd}
              </span>
            )}
          </span>
          <span className={`${NUMBER} font-semibold`}>
            {compactTokens(totalTokens(session.totals))}
          </span>
        </>
      }
    >
      <p className="text-xs break-all text-muted-foreground select-text">
        {harnessName} · {session.sessionId}
        {showDirectory && (
          <>
            <br />
            {session.cwd}
          </>
        )}
      </p>
      {session.models.map(({ model, totals }) => (
        <div key={JSON.stringify(model)} className="space-y-1.5">
          <p className="text-sm font-semibold">{model ?? "Unknown model"}</p>
          <TokenDetails totals={totals} />
        </div>
      ))}
    </ExpandableRow>
  );
}
