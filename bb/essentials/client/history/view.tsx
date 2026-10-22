import { useEffect, useRef, useState } from "react";
import {
  providerDefinitions,
  providerIds,
  type Provider,
} from "essentials/providers";
import { ChoiceGroup } from "./controls";
import { HistoryResults } from "./results";

export interface HistorySelection {
  provider: Provider;
  days: 7 | 30;
}

/** Below this width the view drops secondary columns. */
const COMPACT_WIDTH = 560;

function useCompact() {
  const ref = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(true);
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setCompact(entry.contentRect.width < COMPACT_WIDTH);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, compact };
}

/** Host-wide usage history with provider and period controls. */
export function HistoryView({ initial }: { initial: HistorySelection }) {
  const [selection, setSelection] = useState(initial);
  const { ref, compact } = useCompact();
  const select = (next: Partial<HistorySelection>) =>
    setSelection((current) => ({ ...current, ...next }));
  const { provider, days } = selection;
  return (
    <div ref={ref} className="mx-auto w-full max-w-5xl space-y-6">
      <div className="space-y-3">
        <div className="space-y-0.5">
          <h2 className="text-lg font-semibold">Usage history</h2>
          <p className="text-xs text-muted-foreground">
            Every thread on this bb host
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ChoiceGroup
            label="Provider"
            value={provider}
            onChange={(next) => select({ provider: next })}
            choices={providerIds.map((id) => ({
              value: id,
              label: providerDefinitions[id].name,
            }))}
          />
          <ChoiceGroup
            label="Time period"
            value={days}
            onChange={(next) => select({ days: next })}
            choices={[
              { value: 7, label: "7d", name: "7 days" },
              { value: 30, label: "30d", name: "30 days" },
            ]}
          />
        </div>
      </div>
      <HistoryResults
        key={`${provider}:${days}`}
        selection={selection}
        compact={compact}
      />
    </div>
  );
}
