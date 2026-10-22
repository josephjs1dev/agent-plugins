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
  applyCliUpdateDefinition,
  checkCliUpdatesDefinition,
  cliSchema,
  readMaintenanceDefinition,
} from "essentials/cli-maintenance";
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

/**
 * bb scopes workspace history to the thread's environment. A null thread
 * reads host history only.
 */
export const historyInput = readHistoryDefinition.input
  .omit({ workspaceId: true })
  .extend({ threadId: threadId.nullable() });

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
});
export type ReminderState = z.infer<typeof reminderStateSchema>;

export const modelSchema = z.object({
  id: z.string().max(400),
  label: z.string().max(400),
  description: z.string().max(2000),
});

/** The Essentials RPCs on bb, keyed by the core definitions' names. */
export const essentialsContract = defineRpcContract({
  "usage.read": method(readUsageDefinition),
  "usage.codex-reset.prepare": method(prepareCodexResetDefinition),
  "usage.codex-reset.consume": method(consumeCodexResetDefinition),
  "usage.history": method({
    input: historyInput,
    output: readHistoryDefinition.output,
  }),
  "cli.status": method(readMaintenanceDefinition),
  "cli.check": method(checkCliUpdatesDefinition),
  "cli.update": method(applyCliUpdateDefinition),
  "cli.models.refresh": method({
    input: z.object({ id: cliSchema }).strict(),
    output: readMaintenanceDefinition.output,
  }),
  // bb-only: the model catalog comes from bb's providers.
  "cli.models": method({
    input: z.object({ id: cliSchema }).strict(),
    output: z.object({
      models: z.array(modelSchema).max(2000),
      error: z.string().max(400),
    }),
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
  "context_reminder.demo": method({
    input: thread.extend({ percent: z.int().min(0).max(100) }),
    output: reminderStateSchema,
  }),
});
export type EssentialsContract = typeof essentialsContract;

export type Handlers =
  ExperimentalPluginRpcHandlersWithContext<EssentialsContract>;
