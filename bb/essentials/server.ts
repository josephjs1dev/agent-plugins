import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { join } from "node:path";
import { essentialsHome } from "essentials/home";
import { historyDirectory } from "essentials/history-store";
import { createWorkspaceSessions } from "essentials/workspace-sessions";
import { essentialsContract } from "./server/entrypoints/contract";
import {
  contextReminder,
  reminderSettings,
} from "./server/entrypoints/context-reminder";
import { observeThreads } from "./server/entrypoints/events";
import { maintenanceHandlers } from "./server/entrypoints/maintenance";
import { usageHandlers } from "./server/entrypoints/usage";

export default function plugin(bb: BbPluginApi): void {
  const sdk = () => bb.sdk;
  // Both hosts derive the history cache from the same local records, so they
  // share it. Each host rewrites its session links from memory, so bb keeps
  // its own.
  const directory = historyDirectory();
  const sessions = createWorkspaceSessions(join(essentialsHome(), "bb"));
  const usage = usageHandlers({ sdk, directory, sessions });
  const maintenance = maintenanceHandlers(sdk);
  const reminder = contextReminder({
    sdk,
    settings: bb.settings.define(reminderSettings),
    realtime: bb.realtime,
    log: bb.log,
  });
  bb.rpc.register(essentialsContract, {
    ...usage.handlers,
    ...maintenance.handlers,
    ...reminder.handlers,
  });
  observeThreads(bb, { sdk, sessions, reminder });
  bb.onDispose(async () => {
    reminder.clear();
    maintenance.close();
    await usage.close();
  });
}
