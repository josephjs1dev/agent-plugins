import type {
  BbPluginApi,
  ExperimentalHostClient,
  ExperimentalPluginProviderEnvContext,
} from "@get-bb/plugin-sdk";
import {
  nativeSessionSchema,
  providerHomeEnv,
  type SessionProvider,
} from "essentials/cleaner/contracts";
import type { HostContract } from "../../entrypoints/host-contract";
import {
  isSessionComplete,
  newTrackedThread,
  sessionKey,
  type CleanerStore,
  type TrackedThread,
} from "./cleaner-store";

type Sdk = BbPluginApi["sdk"];
export type Thread = Awaited<ReturnType<Sdk["threads"]["list"]>>[number];
type SessionEvent = NonNullable<
  Awaited<ReturnType<Sdk["threads"]["events"]["wait"]>>
>;

/** Cleaner's typed settings. */
export interface CleanerConfig {
  enabled: boolean;
  days: number;
  deleteSessions: boolean;
  /** Overrides, or empty to use the recorded or host default. */
  claudeConfigDir: string;
  codexHome: string;
  codexBin: string;
}

/** bb caps event-history pages at 100 events. */
const EVENT_PAGE_SIZE = 100;
const MAX_EVENT_PAGES = 200;
const MAX_SESSIONS = 2000;
const MESSAGE_MAX = 1000;
const SESSION_EVENT_TYPES = [
  "thread/identity",
  "provider.env-resolved",
] as const;
export const NO_IDENTITY =
  "No native session identity was captured before deletion. No provider data was removed.";

export function isSessionProvider(
  provider: string,
): provider is SessionProvider {
  return provider === "codex" || provider === "claude-code";
}

export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MESSAGE_MAX);
}

function storagePathFor(root: string, threadId: string): string {
  return `${root.replace(/\/$/, "")}/${threadId}`;
}

/** Runs work for one thread at a time, in call order. A failed call does not block the next one. */
export function threadLock() {
  const tails = new Map<string, Promise<unknown>>();
  return <T>(threadId: string, work: () => Promise<T>): Promise<T> => {
    const next = (tails.get(threadId) ?? Promise.resolve())
      .catch(() => undefined)
      .then(work);
    tails.set(threadId, next);
    next
      .finally(() => {
        if (tails.get(threadId) === next) {
          tails.delete(threadId);
        }
      })
      .catch(() => undefined);
    return next;
  };
}
export type ThreadLock = ReturnType<typeof threadLock>;

/** Adds an identity or environment event's session to the record. */
function mergeSessionEvent(record: TrackedThread, event: SessionEvent) {
  if (
    event.type !== "thread/identity" &&
    event.type !== "provider.env-resolved"
  ) {
    return;
  }
  const parsed = nativeSessionSchema.safeParse({
    id: event.data.providerThreadId,
    provider: record.provider,
    home: null,
  });
  if (!parsed.success) {
    return;
  }
  let session = record.sessions.find((entry) => entry.id === parsed.data.id);
  if (!session) {
    if (record.sessions.length >= MAX_SESSIONS) {
      throw new Error("Thread has more than 2,000 native sessions.");
    }
    session = parsed.data;
    record.sessions.push(session);
    // A session found after deletion reopens the finished cleanup.
    if (record.deletedAt !== null && record.requested) {
      record.done = false;
    }
  }
  if (event.type === "provider.env-resolved") {
    session.environmentResolved = true;
    const name = providerHomeEnv[record.provider];
    const entry = event.data.entries.find(
      (candidate) => candidate.name === name,
    );
    if (entry) {
      if (typeof entry.value !== "string") {
        throw new Error(
          `${name} was masked, so its session data directory cannot be resolved.`,
        );
      }
      session.home = entry.value;
    }
  }
}

export interface SessionDeps {
  sdk: () => Sdk;
  host: ExperimentalHostClient<HostContract>;
  store: CleanerStore;
  config: () => Promise<CleanerConfig>;
  log: Pick<BbPluginApi["log"], "warn">;
  lock: ThreadLock;
  /** Aborts every live listener when the plugin unloads. */
  lifetime: AbortSignal;
}

/**
 * Records each Claude Code and Codex thread's native session IDs and homes
 * while bb can still read its history, and deletes them after bb deletes the
 * thread. bb's deletion event fires before shutdown finishes and blocks
 * history reads, so identities must be captured beforehand.
 */
export function sessionTracker(deps: SessionDeps) {
  const { sdk, host, store, config, log, lock, lifetime } = deps;
  /** Live event listeners by thread ID. */
  const watchers = new Map<string, AbortController>();

  /**
   * Listens for new identities while a thread runs. A request already
   * waiting can return a committed identity after deletion blocks new
   * history reads, so this never advances the indexed cursor.
   */
  function watch(threadId: string) {
    if (watchers.has(threadId) || lifetime.aborted) {
      return;
    }
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, lifetime]);
    watchers.set(threadId, controller);
    const initialSeq = store.get(threadId)?.afterSeq ?? 0;
    const listen = async (type: (typeof SESSION_EVENT_TYPES)[number]) => {
      let afterSeq = initialSeq;
      while (!signal.aborted) {
        const event = await sdk().threads.events.wait({
          threadId,
          type,
          afterSeq: String(afterSeq),
          waitMs: "30000",
          signal,
        });
        if (!event) {
          continue;
        }
        afterSeq = event.seq;
        await lock(threadId, async () => {
          const record = store.get(threadId);
          if (!record) {
            return;
          }
          try {
            mergeSessionEvent(record, event);
          } catch (error) {
            record.indexError = errorMessage(error);
            record.error = record.indexError;
          }
          store.put(record);
        });
      }
    };
    Promise.allSettled(SESSION_EVENT_TYPES.map(listen))
      .then((results) => {
        for (const result of results) {
          const reason = String(
            result.status === "rejected" ? result.reason : "",
          );
          if (
            result.status === "rejected" &&
            !signal.aborted &&
            !/404|not found/i.test(reason)
          ) {
            log.warn(`Cleaner identity listener failed: ${reason}`);
          }
        }
      })
      .finally(() => {
        controller.abort();
        if (watchers.get(threadId) === controller) {
          watchers.delete(threadId);
        }
      })
      .catch(() => undefined);
  }

  function unwatch(threadId?: string) {
    for (const [id, controller] of watchers) {
      if (threadId === undefined || id === threadId) {
        controller.abort();
      }
    }
  }

  /** Before a provider session launches: records the thread and starts its listeners. */
  async function track(
    provider: string,
    { threadId, hostId }: ExperimentalPluginProviderEnvContext,
  ) {
    if (!isSessionProvider(provider) || !(await config()).deleteSessions) {
      return;
    }
    await lock(threadId, async () => {
      const machine = await sdk().hosts.get({ hostId });
      if (!machine.threadStorageRootPath) {
        throw new Error(
          "Cleaner cannot resolve bb thread storage on this host.",
        );
      }
      const previous = store.get(threadId);
      if (previous?.deletedAt != null) {
        throw new Error(
          "Thread was deleted while Cleaner prepared session tracking.",
        );
      }
      if (previous && previous.hostId !== hostId) {
        throw new Error(
          "Cleaner cannot move session ownership to a different host.",
        );
      }
      const record =
        previous ??
        newTrackedThread({
          id: threadId,
          provider,
          hostId,
          storagePath: storagePathFor(machine.threadStorageRootPath, threadId),
        });
      // bb owns this directory and removes it after its runtime stops. Create
      // it before launch, so its later absence is shutdown evidence.
      const observed = await host.call(
        "cleaner.observe_storage",
        { storagePath: record.storagePath, create: true },
        { hostId, timeoutMs: 5000 },
      );
      record.storageObserved = observed.exists;
      store.put(record);
    });
    watch(threadId);
  }

  /** Reads the thread's whole identity and environment history into its record. */
  async function index(
    thread: Thread,
    signal: AbortSignal = lifetime,
    createStorage = false,
  ) {
    if (!isSessionProvider(thread.providerId) || !thread.environmentHostId) {
      return;
    }
    const provider = thread.providerId;
    const hostId = thread.environmentHostId;
    await lock(thread.id, async () => {
      const previous = store.get(thread.id);
      if (previous?.deletedAt != null) {
        return;
      }
      const unchanged =
        previous &&
        previous.lastSnapshotAt === thread.updatedAt &&
        !previous.indexError &&
        previous.storageObserved &&
        ["idle", "error"].includes(thread.status);
      if (!createStorage && unchanged) {
        return;
      }
      const machine = await sdk().hosts.get({ hostId, signal });
      if (previous && previous.hostId !== machine.id) {
        throw new Error(
          "Thread moved hosts. Automatic session cleanup needs review.",
        );
      }
      const record =
        previous ??
        newTrackedThread({
          id: thread.id,
          provider,
          hostId: machine.id,
          storagePath: machine.threadStorageRootPath
            ? storagePathFor(machine.threadStorageRootPath, thread.id)
            : "",
        });
      try {
        record.afterSeq = 0;
        for (let pages = 0; ; pages++) {
          if (pages >= MAX_EVENT_PAGES) {
            throw new Error(
              "Thread session history exceeded the Cleaner scan limit.",
            );
          }
          const events = await sdk().threads.events.list({
            threadId: thread.id,
            types: [...SESSION_EVENT_TYPES],
            afterSeq: String(record.afterSeq),
            limit: String(EVENT_PAGE_SIZE),
            order: "asc",
            signal,
          });
          for (const event of events) {
            mergeSessionEvent(record, event);
            record.afterSeq = Math.max(record.afterSeq, event.seq);
          }
          if (events.length < EVENT_PAGE_SIZE) {
            break;
          }
        }
        const settings = await config();
        const override = (
          provider === "codex" ? settings.codexHome : settings.claudeConfigDir
        ).trim();
        if (override) {
          for (const session of record.sessions) {
            session.home ??= override;
          }
        }
        if (
          !record.storageObserved &&
          record.storagePath &&
          machine.status === "connected"
        ) {
          const observed = await host.call(
            "cleaner.observe_storage",
            { storagePath: record.storagePath, create: createStorage },
            { hostId: machine.id, timeoutMs: 5000, signal },
          );
          record.storageObserved = observed.exists;
        }
        record.indexError = null;
        record.lastSnapshotAt = thread.updatedAt;
        record.error = null;
        if (thread.status === "active" || thread.status === "starting") {
          watch(thread.id);
        }
      } catch (error) {
        record.indexError = errorMessage(error);
        record.error = record.indexError;
        throw error;
      } finally {
        store.put(record);
      }
    });
  }

  /** Another live thread on the same host still references one of this record's sessions. */
  function sharesSession(
    record: TrackedThread,
    records: readonly TrackedThread[],
  ) {
    const keys = new Set(record.sessions.map(sessionKey));
    return records.some(
      (other) =>
        other.id !== record.id &&
        other.deletedAt === null &&
        other.hostId === record.hostId &&
        other.sessions.some((session) => keys.has(sessionKey(session))),
    );
  }

  /**
   * Advances a deleted thread's cleanup by one session: native deletion,
   * then, for Codex, its desktop catalog entry. Returns the problem to show,
   * or null.
   */
  async function cleanupNext(
    record: TrackedThread,
    records: readonly TrackedThread[],
    signal: AbortSignal,
  ): Promise<string | null> {
    if (!record.sessions.length) {
      return NO_IDENTITY;
    }
    if (record.indexError) {
      return record.indexError;
    }
    if (sharesSession(record, records)) {
      return "Waiting: another bb thread still references this provider session.";
    }
    const machine = await sdk().hosts.get({ hostId: record.hostId, signal });
    if (machine.status !== "connected") {
      throw new Error("Session cleanup waits for its host to reconnect.");
    }
    const session = record.sessions.find(
      (entry) => !isSessionComplete(record, entry),
    );
    if (!session) {
      record.done = true;
      return null;
    }
    if (!session.environmentResolved) {
      return "Waiting for the provider environment: the session data directory is not confirmed yet.";
    }
    const key = sessionKey(session);
    if (!record.completed.includes(key)) {
      const result = await host.call(
        "cleaner.delete_sessions",
        {
          target: {
            threadId: record.id,
            storagePath: record.storagePath,
            storageObserved: record.storageObserved,
            sessions: [session],
          },
          codexBin: (await config()).codexBin.trim() || null,
        },
        { hostId: record.hostId, timeoutMs: 25_000, signal },
      );
      if (result.state !== "done") {
        return result.message;
      }
      record.completed.push(key);
      // Persist native success before the separate catalog call can fail.
      store.put(record);
    }
    if (session.provider === "codex") {
      try {
        await host.call(
          "cleaner.delete_codex_catalog",
          { session: { ...session, provider: "codex" } },
          { hostId: record.hostId, timeoutMs: 8000, signal },
        );
      } catch (error) {
        throw new Error(
          `Codex session deleted. Desktop sidebar cleanup is pending: ${errorMessage(error)}`,
        );
      }
      record.catalogCompleted.push(key);
    }
    record.done = record.sessions.every((entry) =>
      isSessionComplete(record, entry),
    );
    return null;
  }

  /**
   * Marks a deleted thread's record, or reports a deletion with no captured
   * identity. Live listeners stay: a wait already in flight can still return
   * an identity that bb committed before the deletion.
   */
  async function deleted(
    thread: Pick<Thread, "id" | "providerId">,
    requested: boolean,
    deletedAt: number,
  ) {
    await lock(thread.id, async () => {
      const record = store.get(thread.id);
      if (record) {
        record.deletedAt = deletedAt;
        record.requested = requested;
        store.put(record);
      } else if (requested && isSessionProvider(thread.providerId)) {
        store.put(
          newTrackedThread({
            id: thread.id,
            provider: thread.providerId,
            hostId: "",
            storagePath: "",
            deletedAt,
            requested: true,
            error: NO_IDENTITY,
          }),
        );
      }
    });
  }

  return { track, index, watch, unwatch, cleanupNext, deleted };
}
export type SessionTracker = ReturnType<typeof sessionTracker>;
