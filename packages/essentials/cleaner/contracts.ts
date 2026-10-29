import { z } from "zod";

/** Cleaner suggests threads older than this many days, from 1 to 30. */
export const CLEANER_DAY_OPTIONS = Array.from(
  { length: 30 },
  (_, index) => index + 1,
);
export const DEFAULT_CLEANER_DAYS = 7;
export const cleanerDaysSchema = z.int().min(1).max(30);

/** The variable that overrides each provider's session data directory. */
export const providerHomeEnv = {
  codex: "CODEX_HOME",
  "claude-code": "CLAUDE_CONFIG_DIR",
} as const;

export const sessionProviderSchema = z.enum(["claude-code", "codex"]);
export type SessionProvider = z.infer<typeof sessionProviderSchema>;

/** One native provider session that belongs to a bb thread. */
export const nativeSessionSchema = z.object({
  id: z.uuid(),
  provider: sessionProviderSchema,
  /** The recorded provider home. Null uses the host's environment, then the provider default. */
  home: z.string().max(4096).nullable(),
  /** bb reported the session's provider environment, so `home` is final. */
  environmentResolved: z.boolean().optional(),
});
export type NativeSession = z.infer<typeof nativeSessionSchema>;

const absolutePath = z
  .string()
  .min(1)
  .max(4096)
  .refine(
    (path) => path.startsWith("/") && !path.includes("\0"),
    "Expected an absolute path",
  );

/** The host input that deletes a deleted thread's native sessions. */
export const cleanupTargetSchema = z.object({
  threadId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  /** bb's thread-storage directory for the thread on its host. */
  storagePath: absolutePath,
  /** Cleaner saw the storage directory exist. Only then does its absence prove shutdown. */
  storageObserved: z.boolean(),
  sessions: z.array(nativeSessionSchema).max(2000),
});
export type CleanupTarget = z.infer<typeof cleanupTargetSchema>;

export const cleanupResultSchema = z.object({
  state: z.enum(["waiting", "done"]),
  deleted: z.int().min(0),
  message: z.string().nullable(),
});
export type CleanupResult = z.infer<typeof cleanupResultSchema>;

const memberSchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.number(),
});

/** A visible old thread and its deletion tree. `members` includes the thread itself. */
export const cleanerCandidateSchema = memberSchema.extend({
  projectId: z.string(),
  members: z.array(memberSchema),
});
export type CleanerCandidate = z.infer<typeof cleanerCandidateSchema>;

export const cleanerStatusSchema = z.object({
  enabled: z.boolean(),
  deleteSessions: z.boolean(),
  days: cleanerDaysSchema,
  scannedAt: z.number().nullable(),
  /** Threads in all candidate trees, including dependents. */
  oldThreadCount: z.int().min(0),
  /** Deleted threads whose native session cleanup has not finished. */
  pending: z.int().min(0),
  problems: z.array(z.object({ threadId: z.string(), message: z.string() })),
  scanError: z.string().nullable(),
});
export type CleanerStatus = z.infer<typeof cleanerStatusSchema>;
