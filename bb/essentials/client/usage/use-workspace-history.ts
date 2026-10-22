import { useCallback, useEffect, useState } from "react";
import type { Provider } from "essentials/providers";
import { errorMessage, useCall, useQuery, type Output } from "../data";

/** Paseo's history poll: fast while the server rescans, else every minute. */
const SCAN_POLL_MS = 1_500;
const POLL_MS = 60_000;

export interface WorkspaceHistory {
  data: Output<"usage.history"> | null;
  error: string | null;
  refreshing: boolean;
  refresh(this: void): void;
}

/** The thread's environment history for one provider and period. */
export function useWorkspaceHistory(
  threadId: string,
  provider: Provider,
  days: 7 | 30,
): WorkspaceHistory {
  const call = useCall();
  const [scanning, setScanning] = useState(false);
  const input = {
    provider,
    threadId,
    days,
    scope: "workspace" as const,
    sessionOffset: 0,
  };
  const query = useQuery("usage.history", input, {
    pollMs: scanning ? SCAN_POLL_MS : POLL_MS,
  });
  const [forcing, setForcing] = useState(false);
  const [forceError, setForceError] = useState<string | null>(null);
  const remoteRefreshing = query.data?.refreshing ?? false;
  useEffect(() => setScanning(remoteRefreshing), [remoteRefreshing]);
  const { set } = query;
  const refresh = useCallback(() => {
    setForcing(true);
    setForceError(null);
    call("usage.history", {
      provider,
      threadId,
      days,
      scope: "workspace",
      sessionOffset: 0,
      refresh: true,
    })
      .then(set, (cause: unknown) => setForceError(errorMessage(cause)))
      .finally(() => setForcing(false));
  }, [call, provider, threadId, days, set]);
  return {
    data: query.data,
    error: forceError ?? query.error,
    refreshing: forcing || query.loading || remoteRefreshing,
    refresh,
  };
}
