import { useCallback, useEffect, useRef, useState } from "react";
import {
  useRealtime,
  useRpc,
  type PluginRpcCallArgs,
  type PluginRpcResult,
} from "@get-bb/plugin-sdk/app";
import type { PodiumContract } from "../server/entrypoints/podium-contract";
import { PODIUM_CHANGED } from "../shared/signals";

export type Method = Extract<keyof PodiumContract, string>;
export type Input<M extends Method> = PluginRpcCallArgs<PodiumContract[M]>[0];
export type Output<M extends Method> = PluginRpcResult<PodiumContract[M]>;

/** The Paseo Podium's refresh period; realtime signals refetch sooner. */
const POLL_MS = 15_000;

export function usePodiumRpc() {
  return useRpc<PodiumContract>();
}

export interface Query<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch(this: void): void;
}

export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * One Podium RPC read, refetched on the server's change signal and every
 * 15 seconds. The previous data stays visible when a refetch fails.
 */
export function usePodiumQuery<M extends Method>(
  method: M,
  input: Input<M>,
  enabled = true,
): Query<Output<M>> {
  const rpc = usePodiumRpc();
  const [data, setData] = useState<Output<M> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const key = JSON.stringify(input);
  const generation = useRef(0);
  const refetch = useCallback(() => {
    if (!enabled) {
      return;
    }
    const current = ++generation.current;
    const call = rpc.call as (method: M, input: unknown) => Promise<Output<M>>;
    call(method, JSON.parse(key) as unknown).then(
      (result) => {
        if (current === generation.current) {
          setData(result);
          setError(null);
          setLoading(false);
        }
      },
      (cause: unknown) => {
        if (current === generation.current) {
          setError(errorMessage(cause));
          setLoading(false);
        }
      },
    );
  }, [rpc, method, key, enabled]);
  useEffect(() => {
    refetch();
    const timer = setInterval(refetch, POLL_MS);
    return () => clearInterval(timer);
  }, [refetch]);
  useRealtime(PODIUM_CHANGED, refetch);
  return { data, error, loading, refetch };
}
