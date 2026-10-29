import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  nativeSessionSchema,
  sessionProviderSchema,
  type NativeSession,
} from "essentials/cleaner/contracts";

/**
 * Cleaner's durable outbox: one record per tracked bb thread, in the plugin
 * database. Field names are persisted: rename them only with a migration.
 */
const trackedThreadSchema = z.object({
  id: z.string(),
  provider: sessionProviderSchema,
  /** The bb host that owns the thread's runtime and native session data. */
  hostId: z.string(),
  /** bb's thread-storage directory on that host. Empty when the host reported no storage root. */
  storagePath: z.string(),
  /** Cleaner saw `storagePath` exist, so its later absence proves bb finished shutdown. */
  storageObserved: z.boolean(),
  /** The last indexed event sequence of the identity and environment history. */
  afterSeq: z.number(),
  sessions: z.array(nativeSessionSchema),
  /** The `updatedAt` of the last fully indexed thread snapshot. */
  lastSnapshotAt: z.number().optional(),
  /** The last background cleanup attempt, for retry spacing. */
  attemptedAt: z.number().optional(),
  /** Why session indexing is incomplete. Cleanup does not start while this is set. */
  indexError: z.string().nullable(),
  /** `sessionKey`s whose native provider deletion succeeded. */
  completed: z.array(z.string()),
  /** `sessionKey`s whose Codex desktop catalog entry was removed. */
  catalogCompleted: z.array(z.string()),
  deletedAt: z.number().nullable(),
  /** Provider session deletion was on when bb deleted the thread. */
  requested: z.boolean(),
  /** Every session finished all of its cleanup stages. */
  done: z.boolean(),
  /** The problem that the Cleaner dialog shows. */
  error: z.string().nullable(),
});
export type TrackedThread = z.infer<typeof trackedThreadSchema>;

export function sessionKey(session: NativeSession): string {
  return `${session.provider}:${session.id}`;
}

/** Native deletion succeeded and, for Codex, the desktop catalog entry is gone too. */
export function isSessionComplete(
  record: TrackedThread,
  session: NativeSession,
): boolean {
  const key = sessionKey(session);

  return (
    record.completed.includes(key) &&
    (session.provider !== "codex" || record.catalogCompleted.includes(key))
  );
}

/** bb deleted the thread with cleanup requested, and cleanup has not finished. */
export function awaitsCleanup(record: TrackedThread): boolean {
  return record.deletedAt !== null && record.requested && !record.done;
}

export function newTrackedThread(
  fields: Pick<TrackedThread, "id" | "provider" | "hostId" | "storagePath"> &
    Partial<TrackedThread>,
): TrackedThread {
  return {
    storageObserved: false,
    afterSeq: 0,
    sessions: [],
    indexError: null,
    completed: [],
    catalogCompleted: [],
    deletedAt: null,
    requested: false,
    done: false,
    error: null,
    ...fields,
  };
}

const MIGRATIONS = [
  "CREATE TABLE cleaner_threads (id TEXT PRIMARY KEY, value TEXT NOT NULL)",
];

export interface CleanerStore {
  get(id: string): TrackedThread | null;
  put(record: TrackedThread): void;
  all(): TrackedThread[];
}

function parse(value: string): TrackedThread | null {
  const parsed = trackedThreadSchema.safeParse(JSON.parse(value));

  return parsed.success ? parsed.data : null;
}

/** A record that no longer parses is skipped, so one bad row cannot stop cleanup. */
export function cleanerStore(
  storage: Pick<BbPluginApi["storage"], "database" | "migrate">,
): CleanerStore {
  const db = storage.database();
  storage.migrate(db, MIGRATIONS);
  const read = db.prepare<[string], { value: string }>(
    "SELECT value FROM cleaner_threads WHERE id = ?",
  );
  const write = db.prepare<[string, string]>(
    "INSERT INTO cleaner_threads (id, value) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value",
  );
  const readAll = db.prepare<[], { value: string }>(
    "SELECT value FROM cleaner_threads",
  );

  return {
    get(id) {
      const row = read.get(id);

      return row ? parse(row.value) : null;
    },
    put(record) {
      write.run(record.id, JSON.stringify(record));
    },
    all() {
      return readAll.all().flatMap(({ value }) => {
        const record = parse(value);

        return record ? [record] : [];
      });
    },
  };
}
