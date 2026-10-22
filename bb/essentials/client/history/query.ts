import { useCallback, useEffect, useState } from "react";
import type { Provider } from "essentials/providers";
import { errorMessage, useCall, useQuery } from "../data";

/** Sessions per page; the server returns at most this many. */
export const SESSION_PAGE = 20;
/** Background refetch period, and the faster period while the host rescans. */
const POLL_MS = 60_000;
const RESCAN_POLL_MS = 1_500;

export interface HistoryRequest {
  provider: Provider;
  days: 7 | 30;
  sessionOffset: number;
}

/** The last valid page offset for `count` sessions. */
export function validSessionOffset(offset: number, count: number): number {
  return Math.min(
    offset,
    Math.max(0, Math.ceil(count / SESSION_PAGE) - 1) * SESSION_PAGE,
  );
}

/**
 * Reads usage history, polling every minute and every 1.5 s while the host
 * rescans its records. `refresh` asks the host to rescan now.
 */
export function useHistory(request: HistoryRequest) {
  const call = useCall();
  const query = useQuery("usage.history", request, { pollMs: POLL_MS });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const { data, refetch, set } = query;
  const rescanning = data?.refreshing ?? false;
  useEffect(() => {
    if (!rescanning) {
      return;
    }
    const timer = setTimeout(refetch, RESCAN_POLL_MS);
    return () => clearTimeout(timer);
  }, [rescanning, data, refetch]);
  const key = JSON.stringify(request);
  const refresh = useCallback(() => {
    setRefreshing(true);
    setRefreshError(null);
    const input = JSON.parse(key) as HistoryRequest;
    call("usage.history", { ...input, refresh: true })
      .then(set, (cause: unknown) => setRefreshError(errorMessage(cause)))
      .finally(() => setRefreshing(false));
  }, [call, key, set]);
  return {
    data,
    error: query.error ?? refreshError,
    isPending: data === null && query.error === null,
    isRefreshing: refreshing || rescanning,
    refresh,
  };
}
