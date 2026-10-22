import type {
  BbPluginApi,
  PluginSettingDescriptor,
  PluginSettingsHandle,
} from "@get-bb/plugin-sdk";
import {
  ASK_PERCENT_OPTIONS,
  DEFAULT_SETTINGS,
  NOTIFY_EVERY_OPTIONS,
  SNOOZE_MINUTE_OPTIONS,
  WARN_PERCENT_OPTIONS,
  contextReminderSettingsDefinition,
  toReminderConfig,
  type ContextReminderSettings,
  type ReminderNotice,
} from "essentials/context-reminder/contracts";
import { DEFAULT_WINDOW_TOKENS } from "essentials/context-reminder/gauge";
import { reminderTier } from "essentials/context-reminder/reminder-policy";
import {
  createReminderTracker,
  demoNotice,
} from "essentials/context-reminder/tracker";
import { REMINDER_CHANGED } from "../../shared/signals";
import type { Handlers, ReminderState } from "./contract";

type Sdk = BbPluginApi["sdk"];
type Reading = NonNullable<ReminderState["reading"]>;

function options(values: readonly number[], unit: (value: number) => string) {
  return {
    options: values.map(String),
    experimental_optionLabels: Object.fromEntries(
      values.map((value) => [String(value), unit(value)]),
    ),
  };
}

/** bb's host-rendered settings form. Selects store strings. */
export const reminderSettings = {
  enabled: {
    type: "boolean",
    label: "Show Context Reminder",
    description: "Shows the context banner above the composer.",
    default: DEFAULT_SETTINGS.enabled,
  },
  warnPercent: {
    type: "select",
    label: "Warn at",
    description: "Context-window fill that shows the banner.",
    ...options(WARN_PERCENT_OPTIONS, (value) => `${value}%`),
    default: String(DEFAULT_SETTINGS.warnPercent),
  },
  askPercent: {
    type: "select",
    label: "Ask to compact at",
    description:
      "Fill that asks you to compact. At or below Warn at, every warning asks.",
    ...options(ASK_PERCENT_OPTIONS, (value) => `${value}%`),
    default: String(DEFAULT_SETTINGS.askPercent),
  },
  notifyEvery: {
    type: "select",
    label: "Remind every",
    description: "Turns between reminders while above Warn at.",
    ...options(NOTIFY_EVERY_OPTIONS, (value) =>
      value === 1 ? "1 turn" : `${value} turns`,
    ),
    default: String(DEFAULT_SETTINGS.notifyEvery),
  },
  snoozeMinutes: {
    type: "select",
    label: "Snooze for",
    description: "How long Snooze pauses a thread's reminders.",
    ...options(SNOOZE_MINUTE_OPTIONS, (value) =>
      value < 60 ? `${value} min` : `${value / 60} h`,
    ),
    default: String(DEFAULT_SETTINGS.snoozeMinutes),
  },
  character: {
    type: "select",
    label: "Assistant",
    description: "The sprite in the reminder.",
    options: ["girl", "boy"],
    experimental_optionLabels: { girl: "Girl", boy: "Boy" },
    default: DEFAULT_SETTINGS.character,
  },
} satisfies Record<string, PluginSettingDescriptor>;

type SettingsHandle = Pick<
  PluginSettingsHandle<typeof reminderSettings>,
  "get" | "onChange"
>;

export interface ReminderOptions {
  sdk: () => Sdk;
  settings: SettingsHandle;
  realtime: Pick<BbPluginApi["realtime"], "publish">;
  log: Pick<BbPluginApi["log"], "warn">;
  now?: () => number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Watches top-level threads' context-window fill after each turn and keeps a
 * reminder for the composer banner when a threshold is crossed. State lives
 * in server memory, so a bb restart clears turn counts and snoozes.
 */
export function contextReminder({
  sdk,
  settings,
  realtime,
  log,
  now = Date.now,
}: ReminderOptions) {
  const tracker = createReminderTracker(now);
  const readings = new Map<string, Reading>();
  const notices = new Map<string, ReminderNotice>();
  const snoozes = new Map<string, number>();
  const changed = (threadId: string | null) =>
    realtime.publish(REMINDER_CHANGED, { threadId });

  async function readSettings(): Promise<ContextReminderSettings> {
    try {
      const values = await settings.get();
      const parsed = contextReminderSettingsDefinition.schema.safeParse({
        enabled: values.enabled,
        warnPercent: Number(values.warnPercent),
        askPercent: Number(values.askPercent),
        notifyEvery: Number(values.notifyEvery),
        snoozeMinutes: Number(values.snoozeMinutes),
        character: values.character,
      });
      return parsed.success ? parsed.data : DEFAULT_SETTINGS;
    } catch (error) {
      log.warn(`Context Reminder settings read failed: ${errorMessage(error)}`);
      return DEFAULT_SETTINGS;
    }
  }

  async function readContext(threadId: string): Promise<Reading | null> {
    const { usage } = await sdk().threads.context({ threadId });
    if (!usage || usage.usedTokens <= 0) {
      return null;
    }
    return {
      usedTokens: Math.round(usage.usedTokens),
      maxTokens: Math.round(usage.modelContextWindow) || DEFAULT_WINDOW_TOKENS,
    };
  }

  async function state(threadId: string): Promise<ReminderState> {
    const config = await readSettings();
    let reading = readings.get(threadId) ?? null;
    if (reading === null) {
      reading = await readContext(threadId).catch(() => null);
      if (reading) {
        readings.set(threadId, reading);
      }
    }
    const until = snoozes.get(threadId) ?? 0;
    const snoozed = until > now();
    return {
      config: toReminderConfig(config),
      character: config.character,
      reading,
      notice:
        config.enabled && !snoozed ? (notices.get(threadId) ?? null) : null,
      snoozedUntil: snoozed ? new Date(until).toISOString() : null,
    };
  }

  /** Advances one finished turn of a top-level thread. */
  async function observe(threadId: string): Promise<void> {
    const reading = await readContext(threadId);
    if (reading === null) {
      return;
    }
    readings.set(threadId, reading);
    const config = await readSettings();
    const notice = tracker.observe(
      threadId,
      reading.usedTokens,
      reading.maxTokens,
      config,
    );
    if (notice) {
      notices.set(threadId, notice);
    } else if (
      reminderTier(reading.usedTokens, reading.maxTokens, config) === null
    ) {
      notices.delete(threadId);
    }
    changed(threadId);
  }

  function forget(threadId: string) {
    tracker.forget(threadId);
    readings.delete(threadId);
    notices.delete(threadId);
    snoozes.delete(threadId);
  }

  settings.onChange(() => changed(null));

  const handlers: Pick<
    Handlers,
    | "context_reminder.state"
    | "context_reminder.snooze"
    | "context_reminder.dismiss"
    | "context_reminder.compact"
    | "context_reminder.demo"
  > = {
    "context_reminder.state": ({ threadId }) => state(threadId),
    "context_reminder.snooze"({ threadId, minutes }) {
      snoozes.set(threadId, Date.parse(tracker.snooze(threadId, minutes)));
      notices.delete(threadId);
      changed(threadId);
      return state(threadId);
    },
    "context_reminder.dismiss"({ threadId }) {
      notices.delete(threadId);
      changed(threadId);
      return state(threadId);
    },
    async "context_reminder.compact"({ threadId }) {
      try {
        await sdk().threads.compact({ threadId });
      } catch {
        throw new Error(
          "bb could not compact this thread. Wait for its turn to finish, then try again.",
        );
      }
      notices.delete(threadId);
      changed(threadId);
      return state(threadId);
    },
    async "context_reminder.demo"({ threadId, percent }) {
      notices.set(threadId, demoNotice(percent, await readSettings()));
      changed(threadId);
      return state(threadId);
    },
  };

  return {
    handlers,
    observe,
    forget,
    clear() {
      tracker.clear();
      readings.clear();
      notices.clear();
      snoozes.clear();
    },
  };
}
