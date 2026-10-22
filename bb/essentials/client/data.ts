import { useCallback, useEffect, useRef, useState } from "react";
import {
  useRealtime,
  useRpc,
  type PluginRpcCallArgs,
  type PluginRpcResult,
} from "@get-bb/plugin-sdk/app";
import type { EssentialsContract } from "../server/entrypoints/contract";

export type Method = Extract<keyof EssentialsContract, string>;
export type Input<M extends Method> = PluginRpcCallArgs<
  EssentialsContract[M]
>[0];
export type Output<M extends Method> = PluginRpcResult<EssentialsContract[M]>;

export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Calls one Essentials RPC by name. */
export function useCall() {
  const rpc = useRpc<EssentialsContract>();
  return useCallback(
    <M extends Method>(method: M, input: Input<M>) =>
      (rpc.call as (method: M, input: unknown) => Promise<Output<M>>)(
        method,
        input,
      ),
    [rpc],
  );
}

export interface Query<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch(this: void): void;
  /** Replaces the data, as after a mutation that returns the new state. */
  set(this: void, data: T): void;
}

export interface QueryOptions {
  enabled?: boolean;
  /** Refetch period in milliseconds; 0 turns polling off. */
  pollMs?: number;
  /** Realtime channel that triggers a refetch. */
  signal?: string;
  /** Refetches on `signal` only when this accepts the payload. */
  accepts?: (payload: unknown) => boolean;
}

/**
 * One Essentials RPC read. The previous data stays visible when a refetch
 * fails, and a stale response never replaces a newer one.
 */
export function useQuery<M extends Method>(
  method: M,
  input: Input<M>,
  { enabled = true, pollMs = 0, signal, accepts }: QueryOptions = {},
): Query<Output<M>> {
  const call = useCall();
  const [data, setData] = useState<Output<M> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const key = JSON.stringify(input ?? null);
  const generation = useRef(0);
  const refetch = useCallback(() => {
    if (!enabled) {
      return;
    }
    const current = ++generation.current;
    setLoading(true);
    call(method, JSON.parse(key) as Input<M>).then(
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
  }, [call, method, key, enabled]);
  const set = useCallback((next: Output<M>) => {
    generation.current++;
    setData(next);
    setError(null);
    setLoading(false);
  }, []);
  useEffect(() => {
    refetch();
    if (!pollMs) {
      return;
    }
    const timer = setInterval(refetch, pollMs);
    return () => clearInterval(timer);
  }, [refetch, pollMs]);
  useRealtime(signal ?? "", (payload: unknown) => {
    if (signal && (!accepts || accepts(payload))) {
      refetch();
    }
  });
  return { data, error, loading, refetch, set };
}
