import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { historyDirectory } from "essentials/history-store";
import { essentialsContract } from "./server/entrypoints/contract";
import {
  contextReminder,
  reminderSettings,
} from "./server/entrypoints/context-reminder";
import { observeThreads } from "./server/entrypoints/events";
import { usageHandlers } from "./server/entrypoints/usage";

export default function plugin(bb: BbPluginApi): void {
  const sdk = () => bb.sdk;
  // Both hosts derive the history cache from the same local records, so they
  // share it.
  const directory = historyDirectory();
  const usage = usageHandlers({ directory });
  const reminder = contextReminder({
    sdk,
    settings: bb.settings.define(reminderSettings),
    realtime: bb.realtime,
    log: bb.log,
  });
  bb.rpc.register(essentialsContract, {
    ...usage.handlers,
    ...reminder.handlers,
  });
  observeThreads(bb, { reminder });
  bb.onDispose(async () => {
    reminder.clear();
    await usage.close();
  });
}
