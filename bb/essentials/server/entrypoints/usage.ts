import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createCodexResetter } from "essentials/codex-resetter";
import { sessionKey } from "essentials/history-display";
import { createHistoryStore } from "essentials/history-store";
import { createUsageReader } from "essentials/usage-reader";
import type { createWorkspaceSessions } from "essentials/workspace-sessions";
import { environmentLinks } from "../engine/bb/sessions";
import type { Handlers } from "./contract";

type Sdk = BbPluginApi["sdk"];

const WORKSPACE_WARNING =
  "Could not read this environment's threads. Workspace usage uses previously saved session links.";
const HISTORY_FAILURE =
  "Usage history unavailable. Check the host's storage access and stored data.";

export interface UsageOptions {
  sdk: () => Sdk;
  directory: string;
  sessions: ReturnType<typeof createWorkspaceSessions>;
}

/** Quota, banked Codex resets, and token history. */
export function usageHandlers({ sdk, directory, sessions }: UsageOptions) {
  const reader = createUsageReader();
  const resetter = createCodexResetter(reader);
  const history = createHistoryStore(directory);
  const collect = environmentLinks(sdk);

  async function environmentOf(threadId: string | null) {
    if (threadId === null) {
      return null;
    }
    try {
      return (await sdk().threads.get({ threadId })).environmentId;
    } catch {
      throw new Error("Thread unavailable");
    }
  }

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
    async "usage.history"({
      provider,
      threadId,
      days,
      sessionOffset,
      scope,
      refresh,
    }) {
      const environmentId = await environmentOf(threadId);
      // Environments can share a checkout, so attribute by their sessions.
      const attribution = environmentId
        ? await sessions.read(environmentId, collect, refresh ?? false)
        : { sessions: new Set<string>(), complete: true };
      let result;
      try {
        result = await history.read(
          provider,
          (row) => attribution.sessions.has(sessionKey(row)),
          days,
          sessionOffset,
          environmentId ? scope : "host",
          refresh ?? false,
        );
      } catch {
        throw new Error(HISTORY_FAILURE);
      }
      return attribution.complete || result.warning
        ? result
        : { ...result, warning: WORKSPACE_WARNING };
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
