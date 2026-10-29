import type {
  BbPluginApi,
  ExperimentalHostClient,
  ExperimentalPluginProviderEnvContext,
  PluginSettingDescriptor,
  PluginSettingsHandle,
} from "@get-bb/plugin-sdk";
import {
  CLEANER_DAY_OPTIONS,
  DEFAULT_CLEANER_DAYS,
  cleanerDaysSchema,
  type CleanerCandidate,
  type CleanerStatus,
} from "essentials/cleaner/contracts";
import { cleanerCandidates } from "essentials/cleaner/eligibility";
import { CLEANER_CHANGED } from "../../shared/signals";
import {
  awaitsCleanup,
  cleanerStore,
  type CleanerStore,
} from "../engine/bb/cleaner-store";
import {
  errorMessage,
  sessionTracker,
  threadLock,
  type CleanerConfig,
  type Thread,
} from "../engine/bb/cleaner-sessions";
import type { Handlers } from "./contract";
import type { HostContract } from "./host-contract";

type Sdk = BbPluginApi["sdk"];

/** bb's host-rendered settings form. Selects store strings. */
export const cleanerSettings = {
  cleanerEnabled: {
    type: "boolean",
    label: "Cleaner: suggest old threads",
    description:
      "Marks the Cleaner sidebar button when unpinned threads go without updates.",
    default: true,
  },
  cleanerDays: {
    type: "select",
    label: "Cleaner: suggest after",
    description: "Days without updates before Cleaner suggests a thread.",
    options: CLEANER_DAY_OPTIONS.map(String),
    experimental_optionLabels: Object.fromEntries(
      CLEANER_DAY_OPTIONS.map((day) => [
        String(day),
        day === 1 ? "1 day" : `${day} days`,
      ]),
    ),
    default: String(DEFAULT_CLEANER_DAYS),
  },
  cleanerDeleteSessions: {
    type: "boolean",
    label: "Cleaner: delete provider sessions",
    description:
      "When bb deletes a Claude Code or Codex thread, also deletes its native session on the thread's host.",
    default: false,
  },
  cleanerClaudeConfigDir: {
    type: "string",
    label: "Cleaner: Claude config directory",
    description:
      "Absolute path. Empty uses the thread's CLAUDE_CONFIG_DIR, then ~/.claude.",
    default: "",
  },
  cleanerCodexHome: {
    type: "string",
    label: "Cleaner: Codex home",
    description:
      "Absolute path. Empty uses the thread's CODEX_HOME, then ~/.codex.",
    default: "",
  },
  cleanerCodexBin: {
    type: "string",
    label: "Cleaner: Codex binary",
    description:
      "Absolute path. Empty uses ESSENTIALS_CODEX_BIN, then codex on the host's PATH.",
    default: "",
  },
} satisfies Record<string, PluginSettingDescriptor>;

type SettingsHandle = Pick<
  PluginSettingsHandle<typeof cleanerSettings>,
  "get" | "experimental_set" | "onChange"
>;
type StoredSettings = Awaited<ReturnType<SettingsHandle["get"]>>;

function toConfig(values: StoredSettings): CleanerConfig {
  const days = cleanerDaysSchema.safeParse(Number(values.cleanerDays));

  return {
    enabled: values.cleanerEnabled,
    days: days.success ? days.data : DEFAULT_CLEANER_DAYS,
    deleteSessions: values.cleanerDeleteSessions,
    claudeConfigDir: values.cleanerClaudeConfigDir,
    codexHome: values.cleanerCodexHome,
    codexBin: values.cleanerCodexBin,
  };
}

/** The settings and candidates that a review token was issued for. */
interface Review {
  at: number;
  deleteSessions: boolean;
  days: number;
  candidates: CleanerCandidate[];
}

const DAY_MS = 86_400_000;
const REVIEW_TTL_MS = 5 * 60_000;
const MAX_REVIEWS = 100;
const MAX_SHOWN = 100;
const RETRY_AFTER_MS = 30_000;
const RETRIES_PER_PASS = 20;
const MAX_PROBLEMS = 20;
const THREAD_PAGE_SIZE = 200;
const MAX_THREADS = 20_000;
const SESSION_PROVIDERS = ["claude-code", "codex"] as const;
const LIFECYCLE_EVENTS = [
  "thread.active",
  "thread.idle",
  "thread.failed",
  "thread.archived",
] as const;

/** Members and their update times. Any difference means the tree changed after review. */
function treeFingerprint(candidate: CleanerCandidate): string {
  return candidate.members
    .map((member) => `${member.id}:${member.updatedAt}`)
    .sort()
    .join(",");
}

function matchesReview(config: CleanerConfig, review: Review): boolean {
  return (
    config.enabled &&
    config.deleteSessions === review.deleteSessions &&
    config.days === review.days
  );
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}

export interface CleanerOptions {
  sdk: () => Sdk;
  host: ExperimentalHostClient<HostContract>;
  settings: SettingsHandle;
  storage: Pick<BbPluginApi["storage"], "database" | "migrate">;
  realtime: Pick<BbPluginApi["realtime"], "publish">;
  log: Pick<BbPluginApi["log"], "warn">;
  now?: () => number;
}

/**
 * Cleaner on the server. It scans for old threads, issues single-use
 * deletion reviews, and records native provider sessions while threads are
 * still readable. After bb deletes a thread, from Cleaner or from bb's own
 * Delete, the background service deletes those sessions on the thread's host.
 */
export function cleaner({
  sdk,
  host,
  settings,
  storage,
  realtime,
  log,
  now = Date.now,
}: CleanerOptions) {
  const store: CleanerStore = cleanerStore(storage);
  const lifetime = new AbortController();
  const lock = threadLock();
  const config = async () => toConfig(await settings.get());
  const sessions = sessionTracker({
    sdk,
    host,
    store,
    config,
    log,
    lock,
    lifetime: lifetime.signal,
  });
  /** Review tokens that `cleaner.preview` issued. */
  const reviews = new Map<string, Review>();
  /** The review's provider-session choice for threads that `cleaner.clean` deletes now. */
  const reviewedDeleteSessions = new Map<string, boolean>();
  let scannedAt: number | null = null;
  let scanError: string | null = null;
  let candidates: CleanerCandidate[] = [];
  let scanning: Promise<Thread[]> | null = null;
  const cutoff = (days: number) => now() - days * DAY_MS;
  const publish = () => {
    realtime.publish(CLEANER_CHANGED, null);
  };

  /** Every thread in every project, hidden and archived ones included. */
  async function listAllThreads(signal?: AbortSignal): Promise<Thread[]> {
    const all: Thread[] = [];
    for (const archived of [false, true]) {
      for (let offset = 0; ; offset += THREAD_PAGE_SIZE) {
        const rows = await sdk().threads.list({
          archived,
          includeHidden: true,
          limit: THREAD_PAGE_SIZE,
          offset,
          ...(signal ? { signal } : {}),
        });
        all.push(...rows);
        if (all.length > MAX_THREADS) {
          throw new Error(
            "Cleaner scan exceeded 20,000 threads. No cleanup was attempted.",
          );
        }

        if (rows.length < THREAD_PAGE_SIZE) {
          break;
        }
      }
    }

    return [...new Map(all.map((thread) => [thread.id, thread])).values()];
  }

  /** Refreshes candidates, and indexes sessions when deletion is on. Concurrent calls share one scan. */
  function scan(signal?: AbortSignal): Promise<Thread[]> {
    scanning ??= (async () => {
      const threads = await listAllThreads(signal);
      const current = await config();
      const errors: string[] = [];
      if (current.deleteSessions) {
        for (const thread of threads) {
          try {
            await sessions.index(thread, signal);
          } catch (error) {
            errors.push(`${thread.id}: ${errorMessage(error)}`);
          }
        }
      }

      candidates = current.enabled
        ? cleanerCandidates(threads, cutoff(current.days))
        : [];
      scannedAt = now();
      scanError = errors.length
        ? `Some native sessions could not be indexed, so cleanup is paused. ${errors[0]}`
        : null;
      publish();

      return threads;
    })()
      .catch((error: unknown) => {
        scanError = errorMessage(error);
        throw error;
      })
      .finally(() => {
        scanning = null;
      });

    return scanning;
  }

  async function status(): Promise<CleanerStatus> {
    const current = await config();
    const pending = store.all().filter(awaitsCleanup);

    return {
      enabled: current.enabled,
      deleteSessions: current.deleteSessions,
      days: current.days,
      scannedAt,
      oldThreadCount: current.enabled
        ? candidates.reduce((sum, entry) => sum + entry.members.length, 0)
        : 0,
      pending: pending.length,
      problems: pending
        .flatMap((record) =>
          record.error ? [{ threadId: record.id, message: record.error }] : [],
        )
        .slice(0, MAX_PROBLEMS),
      scanError,
    };
  }

  /** Retries pending cleanups, oldest attempt first, at most once per 30 s each. */
  async function processPendingCleanups(signal: AbortSignal) {
    if (
      !(await config()).deleteSessions ||
      scanError !== null ||
      scannedAt === null
    ) {
      return;
    }

    const records = store.all();
    const due = records
      .filter(
        (record) =>
          awaitsCleanup(record) &&
          now() - (record.attemptedAt ?? 0) >= RETRY_AFTER_MS,
      )
      .sort((a, b) => (a.attemptedAt ?? 0) - (b.attemptedAt ?? 0))
      .slice(0, RETRIES_PER_PASS);
    for (const { id } of due) {
      signal.throwIfAborted();
      await lock(id, async () => {
        const record = store.get(id);
        if (!record || record.done || !(await config()).deleteSessions) {
          return;
        }

        record.attemptedAt = now();
        store.put(record);
        try {
          record.error = await sessions.cleanupNext(record, records, signal);
        } catch (error) {
          record.error = errorMessage(error);
        }

        store.put(record);
      });
    }

    publish();
  }

  /** Stops, indexes, and deletes one reviewed candidate. Returns every deleted thread ID, or throws the skip reason. */
  async function deleteReviewed(id: string, review: Review): Promise<string[]> {
    const reviewed = review.candidates.find((entry) => entry.id === id);
    const current = await config();
    if (!reviewed || !matchesReview(current, review)) {
      throw new Error("Cleaner settings changed. Scan and confirm again.");
    }

    const threads = await listAllThreads();
    const candidate = cleanerCandidates(threads, cutoff(current.days)).find(
      (entry) => entry.id === id,
    );
    if (
      !candidate ||
      treeFingerprint(candidate) !== treeFingerprint(reviewed)
    ) {
      throw new Error(
        "The thread or a thread below it changed, was pinned, or has work in progress. Scan again.",
      );
    }

    // Stop first, index after the stop, then check the whole tree again right before deletion.
    for (const member of candidate.members) {
      await sdk().threads.stop({ threadId: member.id });
    }

    if (current.deleteSessions) {
      for (const member of candidate.members) {
        const thread = threads.find((entry) => entry.id === member.id);
        if (thread) {
          await sessions.index(thread, lifetime.signal, true);
        }
      }
    }

    const fresh = cleanerCandidates(
      await listAllThreads(),
      cutoff(current.days),
    ).find((entry) => entry.id === id);
    if (!fresh || treeFingerprint(fresh) !== treeFingerprint(reviewed)) {
      throw new Error(
        "The thread changed while Cleaner prepared it. Scan and confirm again.",
      );
    }

    if (!matchesReview(await config(), review)) {
      throw new Error("Cleaner settings changed. Scan and confirm again.");
    }

    for (const member of candidate.members) {
      reviewedDeleteSessions.set(member.id, review.deleteSessions);
    }

    try {
      await sdk().threads.delete({ threadId: id, childThreadsConfirmed: true });
    } finally {
      for (const member of candidate.members) {
        reviewedDeleteSessions.delete(member.id);
      }
    }

    return candidate.members.map((member) => member.id);
  }

  const handlers: Pick<
    Handlers,
    "cleaner.status" | "cleaner.preview" | "cleaner.clean" | "cleaner.set_days"
  > = {
    "cleaner.status": () => status(),
    async "cleaner.preview"() {
      await scan();
      const token = crypto.randomUUID();
      const shown = candidates.slice(0, MAX_SHOWN);
      for (const [key, review] of reviews) {
        if (now() - review.at > REVIEW_TTL_MS) {
          reviews.delete(key);
        }
      }

      const oldest = reviews.keys().next();
      if (reviews.size >= MAX_REVIEWS && !oldest.done) {
        reviews.delete(oldest.value);
      }

      const current = await config();
      reviews.set(token, {
        at: now(),
        deleteSessions: current.deleteSessions,
        days: current.days,
        candidates: shown,
      });

      return {
        token,
        candidates: shown,
        status: await status(),
        more: candidates.length > shown.length,
      };
    },
    async "cleaner.clean"({ token, threadIds }) {
      const review = reviews.get(token);
      reviews.delete(token);
      if (!review || now() - review.at > REVIEW_TTL_MS) {
        throw new Error("This review expired. Scan and confirm again.");
      }

      if (!(await config()).enabled) {
        throw new Error("Cleaner is off.");
      }

      const selected = [...new Set(threadIds)];
      if (
        selected.some(
          (id) => !review.candidates.some((entry) => entry.id === id),
        )
      ) {
        throw new Error("The selection was not part of this review.");
      }

      const deleted: string[] = [];
      const skipped: { id: string; reason: string }[] = [];
      for (const id of selected) {
        try {
          deleted.push(...(await deleteReviewed(id, review)));
        } catch (error) {
          skipped.push({ id, reason: errorMessage(error) });
        }
      }

      await scan();

      return { deleted, skipped };
    },
    async "cleaner.set_days"({ days }) {
      await settings.experimental_set({ cleanerDays: String(days) });
      // A scan in flight read the old age, so scan again after it.
      await scanning?.catch(() => undefined);
      await scan();

      return status();
    },
  };

  /** Lifecycle events index sessions between scans. A stopped thread needs no live listener. */
  function observe(bb: Pick<BbPluginApi, "events">) {
    for (const event of LIFECYCLE_EVENTS) {
      bb.events.on(event, ({ thread }) => {
        // Handlers run detached: a thread listing must not hold the event.
        void (async () => {
          try {
            if (!(await config()).deleteSessions) {
              return;
            }

            const current = (await listAllThreads()).find(
              (entry) => entry.id === thread.id,
            );
            if (!current) {
              return;
            }

            await sessions.index(current);
            if (event !== "thread.active") {
              sessions.unwatch(thread.id);
            }
          } catch (error) {
            log.warn(
              `Cleaner could not capture a session identity: ${errorMessage(error)}`,
            );
          }
        })();
      });
    }

    // Covers both Cleaner and bb's own Delete action.
    bb.events.on("thread.deleted", async ({ thread }) => {
      const reviewed = reviewedDeleteSessions.get(thread.id);
      const requested = reviewed ?? (await config()).deleteSessions;
      await sessions.deleted(thread, requested, thread.deletedAt ?? now());
      publish();
    });
  }

  /** Records a provider session before it launches. Errors only warn: the session still starts. */
  async function trackProviderSession(
    providerId: string,
    context: ExperimentalPluginProviderEnvContext,
  ) {
    try {
      await sessions.track(providerId, context);
    } catch (error) {
      log.warn(
        `Cleaner could not arm session tracking: ${errorMessage(error)}`,
      );
    }
  }

  settings.onChange((next, previous) => {
    if (
      next.cleanerDeleteSessions === previous.cleanerDeleteSessions &&
      next.cleanerEnabled === previous.cleanerEnabled &&
      next.cleanerDays === previous.cleanerDays
    ) {
      return;
    }

    if (!next.cleanerDeleteSessions) {
      sessions.unwatch();
    }

    (scanning ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => scan(lifetime.signal))
      .catch((error: unknown) => {
        if (!lifetime.signal.aborted) {
          log.warn(`Cleaner settings refresh failed: ${errorMessage(error)}`);
        }
      });
  });

  const service = {
    async start(signal: AbortSignal) {
      while (!signal.aborted) {
        try {
          await scan(signal);
          await processPendingCleanups(signal);
        } catch (error) {
          if (!signal.aborted) {
            log.warn(`Cleaner pass failed: ${errorMessage(error)}`);
          }
        }

        const pause = (await config()).deleteSessions ? 10_000 : 60_000;
        await sleep(pause, signal);
      }
    },
  };

  return {
    handlers,
    service,
    observe,
    providers: SESSION_PROVIDERS,
    trackProviderSession,
    close: () => lifetime.abort(),
  };
}
