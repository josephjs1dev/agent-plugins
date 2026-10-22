import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { cliNames, type CliId } from "essentials/cli-maintenance";
import { refreshCliCache } from "essentials/cli-cache";

// The compiler provides @getpaseo/plugin, not @getpaseo/client.
type PaseoApi = PluginHandlerContext["paseo"];

type ModelHost = {
  workspaces: Pick<PaseoApi["workspaces"], "ref">;
  config: Pick<PaseoApi["config"], "get">;
  providers: Pick<PaseoApi["providers"], "refresh" | "waitForReady">;
};

export async function refreshModels(
  id: CliId,
  workspaceId: string | undefined,
  paseo: ModelHost,
  signal: AbortSignal,
): Promise<string> {
  const workspace = workspaceId
    ? await paseo.workspaces.ref(workspaceId).refresh()
    : undefined;

  if (workspaceId && !workspace?.workspaceDirectory) {
    throw new Error("Workspace unavailable.");
  }

  const cacheWarning = await refreshCliCache(
    id,
    async () => (await paseo.config.get()).config.providers[id],
    signal,
  );
  const options = workspace?.workspaceDirectory
    ? { cwd: workspace.workspaceDirectory }
    : {};
  await paseo.providers.refresh({ ...options, providers: [id] });
  const catalog = await paseo.providers.waitForReady({
    ...options,
    timeoutMs: 60_000,
  });
  const entry = catalog.entries.find((entry) => entry.provider === id);

  if (!entry || entry.status !== "ready") {
    throw new Error("Provider discovery failed.");
  }

  return `${cliNames[id]} model picker refreshed: ${entry.models?.length ?? 0} models.${cacheWarning}`;
}
