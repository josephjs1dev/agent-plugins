import type { BbPluginApi, ExperimentalHostClient } from "@get-bb/plugin-sdk";
import type { ExplorerRoot, ExplorerTarget } from "../../shared/file-explorer";
import type { Handlers } from "./contract";
import type { HostContract } from "./host-contract";

type Sdk = BbPluginApi["sdk"];

/** A resolved root, with the host and path that stay on the server. */
type Root = ExplorerRoot & { hostId: string; path: string };

/** The server and host deadline of one file read, search, Git read, or delete. */
const DEADLINE_MS = 15_000;

const publicRoot = ({ key, preview }: Root): ExplorerRoot => ({ key, preview });

/**
 * Lists, searches, reads the Git status of, and deletes the files of a
 * thread's workspace, or of a project's default checkout, on the host that
 * owns it. The root and host come from bb, never from the app. bb-only:
 * Paseo has a native file browser.
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
    | "file_explorer.content"
    | "file_explorer.git_status"
    | "file_explorer.delete"
  >;
  close(): void;
} {
  const lifecycle = new AbortController();
  const searches = new Map<string, AbortController>();
  const deadline = () =>
    AbortSignal.any([lifecycle.signal, AbortSignal.timeout(DEADLINE_MS)]);
  const options = (root: Root, signal: AbortSignal) => ({
    hostId: root.hostId,
    signal,
    timeoutMs: DEADLINE_MS,
  });

  async function resolveRoot(
    target: ExplorerTarget,
    signal: AbortSignal,
  ): Promise<Root | null> {
    if (target.kind === "project") {
      const project = await sdk().projects.get({
        projectId: target.projectId,
        signal,
      });
      const source =
        project.sources.find((candidate) => candidate.isDefault) ??
        project.sources[0];
      if (!source) {
        return null;
      }

      return {
        key: `source:${source.id}`,
        hostId: source.hostId,
        path: source.path,
        preview: { kind: "host", hostId: source.hostId, path: source.path },
      };
    }

    const thread = await sdk().threads.get({
      threadId: target.threadId,
      signal,
    });
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
      key: environment.id,
      hostId: environment.hostId,
      path: environment.path,
      preview: { kind: "workspace", environmentId: environment.id },
    };
  }

  /** Runs `search`, and cancels the older search under the same key. */
  async function latest<T>(
    key: string,
    search: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    searches.get(key)?.abort();
    const controller = new AbortController();
    searches.set(key, controller);
    try {
      return await search(
        AbortSignal.any([
          lifecycle.signal,
          controller.signal,
          AbortSignal.timeout(DEADLINE_MS),
        ]),
      );
    } finally {
      if (searches.get(key) === controller) {
        searches.delete(key);
      }
    }
  }

  return {
    handlers: {
      async "file_explorer.list"({ target, ...input }) {
        const signal = deadline();
        const root = await resolveRoot(target, signal);
        if (!root) {
          return { root: null, entries: [], next: null };
        }

        const page = await host.call(
          "file_explorer.directory",
          { rootPath: root.path, ...input },
          options(root, signal),
        );

        return { ...page, root: publicRoot(root) };
      },
      "file_explorer.search": ({ target, sessionId, ...input }) =>
        latest(JSON.stringify(["files", target, sessionId]), async (signal) => {
          const root = await resolveRoot(target, signal);
          if (!root) {
            return {
              root: null,
              entries: [],
              truncated: false,
              limited: false,
            };
          }

          const result = await host.call(
            "file_explorer.search",
            { rootPath: root.path, ...input },
            options(root, signal),
          );

          return { ...result, root: publicRoot(root) };
        }),
      "file_explorer.content": ({ target, sessionId, ...input }) =>
        latest(
          JSON.stringify(["content", target, sessionId]),
          async (signal) => {
            const root = await resolveRoot(target, signal);
            if (!root) {
              return {
                root: null,
                files: [],
                matches: 0,
                truncated: false,
                limited: false,
              };
            }

            const result = await host.call(
              "file_explorer.content",
              { rootPath: root.path, ...input },
              options(root, signal),
            );

            return { ...result, root: publicRoot(root) };
          },
        ),
      async "file_explorer.git_status"({ target }) {
        const signal = deadline();
        const root = await resolveRoot(target, signal);
        if (!root) {
          return {
            root: null,
            repository: false,
            entries: [],
            truncated: false,
          };
        }

        const status = await host.call(
          "file_explorer.git_status",
          { rootPath: root.path },
          options(root, signal),
        );

        return { ...status, root: publicRoot(root) };
      },
      async "file_explorer.delete"({ target, rootKey, entry }) {
        const signal = deadline();
        const root = await resolveRoot(target, signal);
        if (!root) {
          throw new Error("This workspace is not available.");
        }

        if (root.key !== rootKey) {
          throw new Error("The workspace changed. Refresh the Explorer.");
        }

        return host.call(
          "file_explorer.delete",
          { rootPath: root.path, entry },
          options(root, signal),
        );
      },
    },
    close: () => lifecycle.abort(),
  };
}
