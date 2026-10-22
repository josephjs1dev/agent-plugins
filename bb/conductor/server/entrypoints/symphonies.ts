import { join } from "node:path";
import type { SymphonyHost } from "conductor/symphonies/host";
import { changesRuntime } from "conductor/symphonies/changes";
import { symphonyExecution } from "conductor/symphonies/execution";
import { executionRuntime } from "conductor/symphonies/identity";
import { symphonyMetrics } from "conductor/symphonies/metrics-recorder";
import {
  PROFILES_FILE,
  profileStoreSource,
} from "conductor/symphonies/profile-catalog";
import { fileSymphonyStore } from "conductor/symphonies/store";
import { workerRuntime } from "conductor/symphonies/workers";
import { readerFor } from "conductor/harnesses/usage";

export interface SymphonyServiceOptions {
  /** bb's own symphony directory. */
  directory: string;
  /** The Conductor home; its worker profile store is shared across hosts. */
  home: string;
  host: () => SymphonyHost;
}

/** Owns symphony storage, execution, and reconciliation for bb threads. */
export function symphonyService({
  directory,
  home,
  host,
}: SymphonyServiceOptions) {
  const store = fileSymphonyStore(directory);
  const metrics = symphonyMetrics(store, {
    now: () => Date.now(),
    // bb does not expose provider session logs, so token usage stays unknown.
    sessionOf: async () => null,
    readerFor,
    setTimer(callback, delayMs) {
      const timer = setTimeout(callback, delayMs);
      timer.unref();
      return timer;
    },
    clearTimer(handle) {
      clearTimeout(handle as ReturnType<typeof setTimeout>);
    },
  });
  const profiles = profileStoreSource(join(home, PROFILES_FILE));
  const execution = symphonyExecution(
    store,
    () => ({ ...executionRuntime(host()), ...changesRuntime() }),
    () => workerRuntime(host(), async () => (await profiles.load()).profiles),
    profiles,
    () => metrics,
  );
  let reconciling = false;
  const reconcile = async () => {
    if (reconciling) {
      return;
    }
    reconciling = true;
    try {
      await execution.reconcile();
    } catch {
      /* Preserve durable claims; retry observation on the next tick. */
    } finally {
      reconciling = false;
    }
  };
  return {
    store,
    profiles,
    execution,
    reconcile,
    async close(): Promise<void> {
      // Drain commands before metrics shutdown; collection writes share the
      // same queue and must not race teardown.
      await execution.drain();
      await metrics.close();
    },
  };
}
export type SymphonyService = ReturnType<typeof symphonyService>;
