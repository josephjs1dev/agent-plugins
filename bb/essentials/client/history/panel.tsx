import type { PluginThreadPanelProps } from "@get-bb/plugin-sdk/app";
import { parseHistoryParams } from "../navigation";
import type { HistorySelection } from "./selection";
import { HistoryView } from "./view";

function selectionOf(params: unknown): HistorySelection {
  return parseHistoryParams(params);
}

/** The thread side-panel tab: this environment's or the host's history. */
export function HistoryPanel({ threadId, params }: PluginThreadPanelProps) {
  return (
    <HistoryView
      key={`${threadId}:${JSON.stringify(params)}`}
      threadId={threadId}
      initial={selectionOf(params)}
    />
  );
}

/** Host-wide history for the Essentials page. */
export function HostHistory() {
  return (
    <HistoryView
      threadId={null}
      initial={{ provider: "chatgpt", days: 7, scope: "host" }}
    />
  );
}
