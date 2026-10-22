import { useEffect, useRef, useState } from "react";
import { experimental_ProviderIcon as ProviderIcon } from "@get-bb/plugin-sdk/app";
import {
  providerDefinitions,
  providerIds,
  type Provider,
} from "essentials/providers";
import { ChoiceGroup } from "./controls";
import { HistoryResults } from "./results";
import { scopeLabel, type HistorySelection } from "./selection";

/** bb's agent provider ID whose logo marks each quota provider. */
const PROVIDER_LOGOS: Record<Provider, string> = {
  chatgpt: "codex",
  claude: "claude-code",
  "opencode-go": "opencode",
};
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

/**
 * Usage history with provider, period, and (for a thread) scope controls.
 * A null thread reads host history and hides the scope switch.
 */
export function HistoryView({
  threadId,
  initial,
}: {
  threadId: string | null;
  initial: HistorySelection;
}) {
  const [selection, setSelection] = useState<HistorySelection>(
    threadId === null ? { ...initial, scope: "host" } : initial,
  );
  const { ref, compact } = useCompact();
  const select = (next: Partial<HistorySelection>) =>
    setSelection((current) => ({ ...current, ...next }));
  const { provider, days, scope } = selection;
  return (
    <div ref={ref} className="mx-auto w-full max-w-5xl space-y-6">
      <div className="space-y-3">
        <div className="space-y-0.5">
          <h2 className="text-lg font-semibold">Usage history</h2>
          <p className="text-xs text-muted-foreground">{scopeLabel(scope)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ChoiceGroup
            label="Provider"
            value={provider}
            onChange={(next) => select({ provider: next })}
            choices={providerIds.map((id) => ({
              value: id,
              label: (
                <>
                  <ProviderIcon
                    providerKind="agent"
                    provider={{ id: PROVIDER_LOGOS[id] }}
                    className="size-3.5"
                    aria-hidden
                  />
                  {providerDefinitions[id].name}
                </>
              ),
            }))}
          />
          {threadId !== null && (
            <ChoiceGroup
              label="History scope"
              value={scope}
              onChange={(next) => select({ scope: next })}
              choices={[
                { value: "workspace", label: "This environment" },
                { value: "host", label: "All environments" },
              ]}
            />
          )}
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
        key={`${provider}:${days}:${scope}`}
        threadId={threadId}
        selection={selection}
        compact={compact}
      />
    </div>
  );
}
