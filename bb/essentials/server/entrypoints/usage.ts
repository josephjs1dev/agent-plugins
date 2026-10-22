import { createCodexResetter } from "essentials/codex-resetter";
import { createHistoryStore } from "essentials/history-store";
import { createUsageReader } from "essentials/usage-reader";
import type { Handlers } from "./contract";

const HISTORY_FAILURE =
  "Usage history unavailable. Check the host's storage access and stored data.";

export interface UsageOptions {
  directory: string;
}

/**
 * Quota, banked Codex resets, and token history. bb has threads, not
 * workspaces, so history is always host-wide and the core's workspace totals
 * stay empty.
 */
export function usageHandlers({ directory }: UsageOptions) {
  const reader = createUsageReader();
  const resetter = createCodexResetter(reader);
  const history = createHistoryStore(directory);

  const handlers: Pick<
    Handlers,
    | "usage.read"
    | "usage.codex-reset.prepare"
    | "usage.codex-reset.consume"
    | "usage.history"
  > = {
    "usage.read": ({ provider, refresh }) => reader.read(provider, refresh),
    "usage.codex-reset.prepare": () => resetter.prepare(),
    "usage.codex-reset.consume": ({ idempotencyKey, creditId }) =>
      resetter.consume({
        idempotencyKey,
        ...(creditId === undefined ? {} : { creditId }),
      }),
    async "usage.history"({ provider, days, sessionOffset, refresh }) {
      try {
        return await history.read(
          provider,
          () => false,
          days,
          sessionOffset,
          "host",
          refresh ?? false,
        );
      } catch {
        throw new Error(HISTORY_FAILURE);
      }
    },
  };

  return {
    handlers,
    async close() {
      resetter.close();
      reader.close();
      await history.close();
    },
  };
}
