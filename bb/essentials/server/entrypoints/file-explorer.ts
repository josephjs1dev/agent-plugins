import type { BbPluginApi, ExperimentalHostClient } from "@get-bb/plugin-sdk";
import type { Handlers } from "./contract";
import type { HostContract } from "./host-contract";

type Sdk = BbPluginApi["sdk"];

/** The server and host deadline of one file read, Git read, or delete. */
const DEADLINE_MS = 15_000;

/**
 * Lists, searches, reads the Git status of, and deletes the files of a
 * thread's workspace on the host that owns it. The root and host come from the thread's environment, never from the
 * app. bb-only: Paseo has a native file browser.
 */
export function fileExplorerHandlers({
  sdk,
  host,
}: {
  sdk: () => Sdk;
  host: ExperimentalHostClient<HostContract>;
}): {
  handlers: Pick<
    Handlers,
    | "file_explorer.list"
    | "file_explorer.search"
    | "file_explorer.git_status"
    | "file_explorer.delete"
  >;
  close(): void;
} {
  const lifecycle = new AbortController();
  const searches = new Map<string, AbortController>();

  async function workspace(threadId: string, signal: AbortSignal) {
    const thread = await sdk().threads.get({ threadId, signal });
    if (thread.deletedAt !== null || !thread.environmentId) {
      return null;
    }

    const environment = await sdk().environments.get({
      environmentId: thread.environmentId,
      signal,
    });
    if (!environment.path || environment.status === "destroyed") {
      return null;
    }

    return {
      id: environment.id,
      hostId: environment.hostId,
      path: environment.path,
    };
  }

  return {
    handlers: {
      async "file_explorer.list"({ threadId, ...input }) {
        const signal = AbortSignal.any([
          lifecycle.signal,
          AbortSignal.timeout(DEADLINE_MS),
        ]);
        const environment = await workspace(threadId, signal);
        if (!environment) {
          return { environmentId: null, entries: [], next: null };
        }

        const page = await host.call(
          "file_explorer.directory",
          { rootPath: environment.path, ...input },
          { hostId: environment.hostId, signal, timeoutMs: DEADLINE_MS },
        );

        return { ...page, environmentId: environment.id };
      },
      async "file_explorer.search"({ threadId, sessionId, ...input }) {
        const key = JSON.stringify([threadId, sessionId]);
        searches.get(key)?.abort();
        const controller = new AbortController();
        searches.set(key, controller);
        const signal = AbortSignal.any([
          lifecycle.signal,
          controller.signal,
          AbortSignal.timeout(DEADLINE_MS),
        ]);
        try {
          const environment = await workspace(threadId, signal);
          if (!environment) {
            return {
              environmentId: null,
              entries: [],
              truncated: false,
              limited: false,
            };
          }

          const result = await host.call(
            "file_explorer.search",
            { rootPath: environment.path, ...input },
            { hostId: environment.hostId, signal, timeoutMs: DEADLINE_MS },
          );

          return { ...result, environmentId: environment.id };
        } finally {
          if (searches.get(key) === controller) {
            searches.delete(key);
          }
        }
      },
      async "file_explorer.git_status"({ threadId }) {
        const signal = AbortSignal.any([
          lifecycle.signal,
          AbortSignal.timeout(DEADLINE_MS),
        ]);
        const environment = await workspace(threadId, signal);
        if (!environment) {
          return {
            environmentId: null,
            repository: false,
            entries: [],
            truncated: false,
          };
        }

        const status = await host.call(
          "file_explorer.git_status",
          { rootPath: environment.path },
          { hostId: environment.hostId, signal, timeoutMs: DEADLINE_MS },
        );

        return { ...status, environmentId: environment.id };
      },
      async "file_explorer.delete"({ threadId, entry }) {
        const signal = AbortSignal.any([
          lifecycle.signal,
          AbortSignal.timeout(DEADLINE_MS),
        ]);
        const environment = await workspace(threadId, signal);
        if (!environment) {
          throw new Error("This thread has no live workspace.");
        }

        return host.call(
          "file_explorer.delete",
          { rootPath: environment.path, entry },
          { hostId: environment.hostId, signal, timeoutMs: DEADLINE_MS },
        );
      },
    },
    close: () => lifecycle.abort(),
  };
}
