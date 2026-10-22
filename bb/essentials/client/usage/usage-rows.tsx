import { useState, type ReactNode } from "react";
import { harnessDefinitions } from "essentials/harnesses";
import type { History, Totals } from "essentials/history";
import {
  compactTokens,
  exactTokens,
  formatCostEstimate,
  totalTokens,
} from "essentials/history-display";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

function Value({
  label,
  value,
  nested = false,
}: {
  label: string;
  value: string;
  nested?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex justify-between gap-4 text-xs",
        nested && "pl-3 text-muted-foreground",
      )}
    >
      <span>{label}</span>
      <span className="select-text tabular-nums">{value}</span>
    </div>
  );
}

/** Exact token counts and the cost estimate for one total. */
export function TokenDetails({ totals }: { totals: Totals }) {
  const cachedShare =
    totals.input > 0 ? ((100 * totals.cached) / totals.input).toFixed(1) : "0";
  return (
    <div className="space-y-1">
      <Value label="Input" value={exactTokens(totals.input)} />
      <Value
        nested
        label={`Cached · ${cachedShare}% of input`}
        value={exactTokens(totals.cached)}
      />
      <Value label="Output" value={exactTokens(totals.output)} />
      <Value
        nested
        label="Reasoning · included in output"
        value={exactTokens(totals.reasoning)}
      />
      <Value label="Total tokens" value={exactTokens(totalTokens(totals))} />
      {(totals.costEstimate !== undefined || totals.cost !== null) && (
        <Value label="Estimated cost" value={formatCostEstimate(totals)} />
      )}
    </div>
  );
}

/** A row that expands to its details. */
function Expandable({
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
    <div className="border-b last:border-b-0">
      <button
        type="button"
        aria-label={label}
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex min-h-12 w-full items-center gap-3 px-2 py-2.5 text-left hover:bg-state-hover"
      >
        {summary}
        <Icon
          name={expanded ? "ChevronDown" : "ChevronRight"}
          aria-hidden
          className="size-3.5 shrink-0 text-muted-foreground"
        />
      </button>
      {expanded && (
        <div className="mb-3 space-y-4 rounded-md bg-muted/50 p-3">
          {children}
        </div>
      )}
    </div>
  );
}

/** Token use per model, largest first as the server sorts it. */
export function ModelUsage({ models }: { models: History["workspaceModels"] }) {
  if (models.length === 0) {
    return (
      <p className="py-3 text-sm text-muted-foreground">
        No model usage recorded in this period.
      </p>
    );
  }
  return (
    <div>
      {models.map(({ model, totals, sessionCount }) => {
        const name = model ?? "Unknown model";
        return (
          <Expandable
            key={JSON.stringify(model)}
            label={`${name} token details`}
            summary={
              <>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {name}
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {compactTokens(totalTokens(totals))}
                </span>
              </>
            }
          >
            <Value label="Sessions" value={String(sessionCount)} />
            <TokenDetails totals={totals} />
          </Expandable>
        );
      })}
    </div>
  );
}

/** One session: harness, day, models, and per-model token details. */
export function SessionUsage({
  session,
}: {
  session: History["sessions"][number];
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
    <Expandable
      label={`${harnessName} session ${session.sessionId}`}
      summary={
        <>
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="block truncate text-sm font-medium">
              {harnessName} · {date} · {session.sessionId.slice(0, 16)}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {models}
            </span>
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {compactTokens(totalTokens(session.totals))}
          </span>
        </>
      }
    >
      <p className="select-text text-xs text-muted-foreground">
        {harnessName} · {session.sessionId}
      </p>
      {session.models.map(({ model, totals }) => (
        <div key={JSON.stringify(model)} className="space-y-2">
          <p className="text-sm font-semibold">{model ?? "Unknown model"}</p>
          <TokenDetails totals={totals} />
        </div>
      ))}
    </Expandable>
  );
}
