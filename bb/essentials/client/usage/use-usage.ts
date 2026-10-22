import { useCallback, useState } from "react";
import type { Provider } from "essentials/providers";
import type { Usage } from "essentials/usage";
import { errorMessage, useCall, useQuery } from "../data";

/** Paseo's quota poll period; the server caches quota for 5 minutes. */
const POLL_MS = 300_000;

export interface UsageQuery {
  usage: Usage | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh(this: void): void;
  set(this: void, usage: Usage): void;
}

/** One provider's quota, polled, with a forced refresh that skips the cache. */
export function useUsage(provider: Provider): UsageQuery {
  const call = useCall();
  const query = useQuery("usage.read", { provider }, { pollMs: POLL_MS });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const { set } = query;
  const refresh = useCallback(() => {
    setRefreshing(true);
    setRefreshError(null);
    call("usage.read", { provider, refresh: true })
      .then(set, (cause: unknown) => setRefreshError(errorMessage(cause)))
      .finally(() => setRefreshing(false));
  }, [call, provider, set]);
  return {
    usage: query.data,
    loading: query.loading && query.data === null,
    refreshing: refreshing || (query.loading && query.data !== null),
    error: refreshError ?? query.error,
    refresh,
    set,
  };
}
