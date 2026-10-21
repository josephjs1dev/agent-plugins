import type { PluginServerContext } from "@getpaseo/plugin/server";
import contributeProviderUsage from "./server/entrypoints/provider-usage";
import contributeMaintenance from "./server/entrypoints/cli-maintenance";
import contributeContextReminder from "./server/entrypoints/context-reminder";

export default function contribute(context: PluginServerContext) {
  const cleanupProviderUsage = contributeProviderUsage(context);
  const cleanupMaintenance = contributeMaintenance(context);
  const cleanupContextReminder = contributeContextReminder(context);

  return async () => {
    cleanupContextReminder();
    cleanupMaintenance();
    await cleanupProviderUsage();
  };
}
