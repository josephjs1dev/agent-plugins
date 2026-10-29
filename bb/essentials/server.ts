import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { historyDirectory } from "essentials/history-store";
import { childThreadHandlers } from "./server/entrypoints/child-threads";
import { cleaner, cleanerSettings } from "./server/entrypoints/cleaner";
import { essentialsContract } from "./server/entrypoints/contract";
import {
  contextReminder,
  reminderSettings,
} from "./server/entrypoints/context-reminder";
import { observeThreads } from "./server/entrypoints/events";
import { fileExplorerHandlers } from "./server/entrypoints/file-explorer";
import { hostContract } from "./server/entrypoints/host-contract";
import { usageHandlers } from "./server/entrypoints/usage";

export default function plugin(bb: BbPluginApi): void {
  const sdk = () => bb.sdk;
  // One settings form holds every feature's settings.
  const settings = bb.settings.define({
    ...reminderSettings,
    ...cleanerSettings,
  });
  const host = bb.hosts.experimental_client({ contract: hostContract });
  // Both hosts derive the history cache from the same local records, so they
  // share it.
  const directory = historyDirectory();
  const usage = usageHandlers({
    directory,
    bbDataDirectory: bb.server.experimental_dataDir,
  });
  const reminder = contextReminder({
    sdk,
    settings,
    realtime: bb.realtime,
    log: bb.log,
  });
  const fileExplorer = fileExplorerHandlers({ sdk, host });
  const sweeper = cleaner({
    sdk,
    host,
    settings,
    storage: bb.storage,
    realtime: bb.realtime,
    log: bb.log,
  });
  bb.rpc.register(essentialsContract, {
    ...usage.handlers,
    ...reminder.handlers,
    ...childThreadHandlers(sdk),
    ...fileExplorer.handlers,
    ...sweeper.handlers,
  });
  observeThreads(bb, { reminder });
  sweeper.observe(bb);
  // Cleaner records native session identities before each launch.
  for (const providerId of sweeper.providers) {
    bb.providers.experimental_contributeEnv(providerId, async (context) => {
      await sweeper.trackProviderSession(providerId, context);
      return [];
    });
  }
  bb.background.service("cleaner", sweeper.service);
  bb.onDispose(async () => {
    sweeper.close();
    reminder.clear();
    fileExplorer.close();
    await usage.close();
  });
}
