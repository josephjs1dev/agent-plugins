import { z } from "zod";
import { harnessSchema } from "./harnesses";
import { sessionKey } from "./history-display";
import { readStorageFile, writeStorageFile } from "./history-files";

const FILE_NAME = "workspace-sessions.json";
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_SESSIONS = 50_000;
const RETENTION_MS = 90 * 86_400_000;
const SYNC_INTERVAL_MS = 15_000;

export const sessionLinkSchema = z.object({
  workspaceId: z.string().min(1).max(160),
  harness: harnessSchema,
  sessionId: z.string().min(1).max(160),
  seenAt: z.string().datetime(),
});

/** One provider session that ran in a host workspace. */
export type SessionLink = z.infer<typeof sessionLinkSchema>;

const savedSessionsSchema = z.object({
  version: z.literal(1),
  sessions: z.array(sessionLinkSchema).max(MAX_SESSIONS),
});

/**
 * Lists the session links the host still knows. It may return links for
 * other workspaces too; every returned link is saved.
 */
export type CollectLinks = (
  workspaceId: string,
) => Promise<Iterable<SessionLink>>;

/**
 * Remembers which provider sessions ran in each host workspace. Links outlive
 * deleted agents so retained history stays attributed.
 */
export function createWorkspaceSessions(
  directory: string,
  now: () => number = Date.now,
) {
  const sessions = new Map<string, SessionLink>();
  const pending = new Map<string, Promise<void>>();
  const nextSync = new Map<string, number>();
  let hydration: Promise<void> | undefined;
  // Set until changed links are saved, so a failed write is retried.
  let dirty = false;

  const keyOf = (session: SessionLink) =>
    JSON.stringify([session.workspaceId, session.harness, session.sessionId]);

  async function hydrate() {
    hydration ??= (async () => {
      try {
        const contents = await readStorageFile(
          directory,
          FILE_NAME,
          MAX_FILE_BYTES,
        );

        if (contents !== undefined) {
          const saved = savedSessionsSchema.parse(JSON.parse(contents));

          for (const session of saved.sessions) {
            sessions.set(keyOf(session), session);
          }
        }
      } catch {
        // An unreadable file is rebuilt from the sessions the host still knows.
      }
    })();
    await hydration;
  }

  function merge(links: Iterable<SessionLink>) {
    for (const link of links) {
      const key = keyOf(link);
      const previous = sessions.get(key);

      if (!previous || previous.seenAt < link.seenAt) {
        sessions.set(key, link);
        dirty = true;
      }
    }
  }

  async function save() {
    const cutoff = new Date(now() - RETENTION_MS).toISOString();

    for (const [key, session] of sessions) {
      if (session.seenAt < cutoff) {
        sessions.delete(key);
        dirty = true;
      }
    }

    if (!dirty) {
      return;
    }

    const kept = [...sessions.values()]
      .sort((left, right) => right.seenAt.localeCompare(left.seenAt))
      .slice(0, MAX_SESSIONS);
    await writeStorageFile(
      directory,
      FILE_NAME,
      JSON.stringify(savedSessionsSchema.parse({ version: 1, sessions: kept })),
    );
    dirty = false;
  }

  return {
    /**
     * Returns session keys (see `sessionKey`) for the workspace. `complete` is
     * false when the host's sessions could not be read and saved links were used.
     */
    async read(
      workspaceId: string,
      collect: CollectLinks,
      forceSync = false,
    ): Promise<{ sessions: Set<string>; complete: boolean }> {
      await hydrate();
      let complete = true;

      if (forceSync || now() >= (nextSync.get(workspaceId) ?? 0)) {
        if (!pending.has(workspaceId)) {
          pending.set(
            workspaceId,
            (async () => {
              merge(await collect(workspaceId));
              await save();
            })().finally(() => {
              pending.delete(workspaceId);
            }),
          );
        }
      }

      try {
        await pending.get(workspaceId);
        nextSync.set(workspaceId, now() + SYNC_INTERVAL_MS);
      } catch {
        complete = false;
      }

      const keys = new Set<string>();

      for (const session of sessions.values()) {
        if (session.workspaceId === workspaceId) {
          keys.add(sessionKey(session));
        }
      }

      return { sessions: keys, complete };
    },
    /** Saves one link as soon as the host reports it. */
    async record(link: SessionLink): Promise<void> {
      await hydrate();
      merge([sessionLinkSchema.parse(link)]);
      await save();
    },
  };
}
