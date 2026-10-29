import {
  defineRpcContract,
  type ExperimentalPluginRpcHandlersWithContext,
  type StandardSchemaV1,
} from "@get-bb/plugin-sdk";
import { z } from "zod";
import { readUsageDefinition } from "essentials/usage";
import {
  consumeCodexResetDefinition,
  prepareCodexResetDefinition,
} from "essentials/codex-reset";
import { readHistoryDefinition } from "essentials/history";
import {
  directoryPageSchema,
  directoryRequestSchema,
  searchRequestSchema,
  searchResultSchema,
  fileEntrySchema,
} from "essentials/file-explorer/browser";
import {
  contentSearchRequestSchema,
  contentSearchResultSchema,
} from "essentials/file-explorer/content";
import { gitStatusResultSchema } from "essentials/file-explorer/git";
import {
  characterSchema,
  reminderConfigSchema,
  reminderNoticeSchema,
} from "essentials/context-reminder/contracts";
import {
  cleanerCandidateSchema,
  cleanerDaysSchema,
  cleanerStatusSchema,
} from "essentials/cleaner/contracts";
import {
  cleanupPlanSchema,
  cleanupResultSchema,
  planInputSchema,
  runInputSchema,
} from "../../shared/child-threads";
import {
  explorerRootSchema,
  explorerTargetSchema,
} from "../../shared/file-explorer";

interface Typed {
  "~standard": { types?: { input: unknown; output: unknown } | undefined };
}
type Standard<Schema extends Typed> = StandardSchemaV1<
  NonNullable<Schema["~standard"]["types"]>["input"],
  NonNullable<Schema["~standard"]["types"]>["output"]
>;

/**
 * Zod types an issue path as `?: ... | undefined`, which bb's Standard Schema
 * type rejects under `exactOptionalPropertyTypes`. The runtime contract is
 * the same, so keep the inferred input and output types and cast the rest.
 */
export function method<Input extends Typed, Output extends Typed>(definition: {
  input: Input;
  output: Output;
}) {
  return {
    input: definition.input as unknown as Standard<Input>,
    output: definition.output as unknown as Standard<Output>,
  };
}

const threadId = z.string().min(1).max(256);
const thread = z.object({ threadId }).strict();

/** bb has no workspaces, so history is always host-wide. */
export const historyInput = readHistoryDefinition.input.omit({
  workspaceId: true,
  scope: true,
});

/** The panel's thread or project; the server resolves its root. */
const target = { target: explorerTargetSchema };
/** The resolved root, or null when the target has no live checkout. */
const root = { root: explorerRootSchema.nullable() };
/** One panel; a new search cancels its older ones of the same kind. */
const sessionId = z.string().min(1).max(128);

export const reminderReadingSchema = z.object({
  usedTokens: z.int().min(0),
  maxTokens: z.int().positive(),
});

export const reminderStateSchema = z.object({
  config: reminderConfigSchema,
  character: characterSchema,
  /** The latest context-window reading, or null before the first one. */
  reading: reminderReadingSchema.nullable(),
  /** The reminder to show, until the user acts or usage drops below Warn at. */
  notice: reminderNoticeSchema.nullable(),
  snoozedUntil: z.iso.datetime().nullable(),
  /**
   * Turns until the next card while usage is at or above Warn at and no card
   * shows, as after Dismiss; null otherwise. A rise to Ask shows sooner.
   */
  nextCardInTurns: z.int().min(0).max(1000).nullable(),
});
export type ReminderState = z.infer<typeof reminderStateSchema>;

/** Context Reminder settings, typed; bb stores select values as strings. */
export const reminderSettingsSchema = reminderConfigSchema.extend({
  character: characterSchema,
});
export type ReminderSettings = z.infer<typeof reminderSettingsSchema>;

/** The Essentials RPCs on bb, keyed by the core definitions' names. */
export const essentialsContract = defineRpcContract({
  "usage.read": method(readUsageDefinition),
  "usage.codex-reset.prepare": method(prepareCodexResetDefinition),
  "usage.codex-reset.consume": method(consumeCodexResetDefinition),
  "usage.history": method({
    input: historyInput,
    output: readHistoryDefinition.output,
  }),
  "context_reminder.state": method({
    input: thread,
    output: reminderStateSchema,
  }),
  "context_reminder.snooze": method({
    input: thread.extend({ minutes: z.int().positive().max(10_080) }),
    output: reminderStateSchema,
  }),
  "context_reminder.dismiss": method({
    input: thread,
    output: reminderStateSchema,
  }),
  "context_reminder.compact": method({
    input: thread,
    output: reminderStateSchema,
  }),
  "context_reminder.settings": method({
    input: z.object({}).strict(),
    output: reminderSettingsSchema,
  }),
  "context_reminder.configure": method({
    input: reminderSettingsSchema.partial().strict(),
    output: reminderSettingsSchema,
  }),
  "context_reminder.demo": method({
    input: thread.extend({ percent: z.int().min(0).max(100) }),
    output: reminderStateSchema,
  }),
  // bb-only: Paseo archives and deletes child agents natively.
  "child_threads.plan": method({
    input: planInputSchema,
    output: cleanupPlanSchema,
  }),
  "child_threads.run": method({
    input: runInputSchema,
    output: cleanupResultSchema,
  }),
  // bb-only: the sidebar Cleaner for old threads and their provider sessions.
  "cleaner.status": method({
    input: z.object({}).strict(),
    output: cleanerStatusSchema,
  }),
  /**
   * Scans, then issues a single-use review token for the first 100
   * candidates. `more` means some candidates were not shown.
   */
  "cleaner.preview": method({
    input: z.object({}).strict(),
    output: z.object({
      token: z.string(),
      candidates: z.array(cleanerCandidateSchema),
      status: cleanerStatusSchema,
      more: z.boolean(),
    }),
  }),
  /** Deletes reviewed candidates. Each is checked again, and skipped with a reason when it changed. */
  "cleaner.clean": method({
    input: z
      .object({
        token: z.string().min(1).max(128),
        threadIds: z.array(threadId).min(1).max(100),
      })
      .strict(),
    output: z.object({
      deleted: z.array(z.string()),
      skipped: z.array(z.object({ id: z.string(), reason: z.string() })),
    }),
  }),
  "cleaner.set_days": method({
    input: z.object({ days: cleanerDaysSchema }).strict(),
    output: cleanerStatusSchema,
  }),
  // bb-only: Paseo has a native file browser. The server resolves the root
  // from the thread or project, so the app never names a host path.
  "file_explorer.list": method({
    input: directoryRequestSchema.extend(target).strict(),
    output: directoryPageSchema.extend(root),
  }),
  "file_explorer.search": method({
    input: searchRequestSchema.extend({ ...target, sessionId }).strict(),
    output: searchResultSchema.extend(root),
  }),
  "file_explorer.content": method({
    input: contentSearchRequestSchema.extend({ ...target, sessionId }).strict(),
    output: contentSearchResultSchema.extend(root),
  }),
  "file_explorer.git_status": method({
    input: z.object(target).strict(),
    output: gitStatusResultSchema.extend(root),
  }),
  /**
   * Permanently deletes a file, or a folder and its contents. `rootKey` is
   * the root the user saw, so a changed root fails instead of deleting there.
   */
  "file_explorer.delete": method({
    input: z
      .object({
        ...target,
        rootKey: explorerRootSchema.shape.key,
        entry: fileEntrySchema,
      })
      .strict(),
    output: z.object({ path: z.string() }),
  }),
});
export type EssentialsContract = typeof essentialsContract;

export type Handlers =
  ExperimentalPluginRpcHandlersWithContext<EssentialsContract>;
