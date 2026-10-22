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
  characterSchema,
  reminderConfigSchema,
  reminderNoticeSchema,
} from "essentials/context-reminder/contracts";

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
function method<Input extends Typed, Output extends Typed>(definition: {
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
});
export type EssentialsContract = typeof essentialsContract;

export type Handlers =
  ExperimentalPluginRpcHandlersWithContext<EssentialsContract>;
