import type { PluginThreadPanelProps } from "@get-bb/plugin-sdk/app";
import { parseHistoryParams } from "../navigation";
import { HistoryView } from "./view";

/** The thread side-panel tab. */
export function HistoryPanel({ threadId, params }: PluginThreadPanelProps) {
  return (
    <HistoryView
      key={`${threadId}:${JSON.stringify(params)}`}
      initial={parseHistoryParams(params)}
    />
  );
}

/** The Usage history page in the navigation rail. */
export function HistoryPage() {
  return (
    <div className="h-full min-h-0 overflow-y-auto p-4 md:p-5">
      <HistoryView initial={{ provider: "chatgpt", days: 7 }} />
    </div>
  );
}
