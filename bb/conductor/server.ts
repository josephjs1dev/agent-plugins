import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { join } from "node:path";
import { conductorHome } from "conductor/home";
import { translatedHost } from "conductor/agents/vocabulary";
import { agentIds } from "./server/engine/bb/agent-ids";
import { bbSymphonyHost } from "./server/engine/bb/symphony-host";
import { bbVocabulary } from "./server/engine/bb/vocabulary";
import { registerCli } from "./server/entrypoints/cli";
import { observeThreads } from "./server/entrypoints/events";
import { symphonyService } from "./server/entrypoints/symphonies";
import { registerTools } from "./server/entrypoints/tools";

/** How often reconciliation inspects task threads, as in the Paseo adapter. */
const RECONCILE_MS = 5000;

export default function plugin(bb: BbPluginApi): void {
  const home = conductorHome();
  // bb keeps its own symphonies: another host's reconciler would treat bb
  // threads as missing agents. Worker profiles stay shared in the home.
  const directory = join(home, "bb");
  const ids = agentIds(bb.storage.kv);
  // The core and the shared profile store use Paseo's provider and mode IDs.
  const host = translatedHost(
    bbSymphonyHost({
      sdk: () => bb.sdk,
      ids,
      kv: bb.storage.kv,
      pluginId: bb.pluginId,
    }),
    bbVocabulary,
  );
  const service = symphonyService({ directory, home, host: () => host });
  const ready = service.execution
    .interrupt(
      null,
      "Conductor reloaded with unreported work. The source agent must reclaim or report its existing attempt; no replacement was launched.",
    )
    .catch((error: unknown) => {
      bb.log.warn(
        `Conductor could not mark interrupted symphonies: ${String(error)}`,
      );
    });
  registerTools(bb, service, ids, ready);
  observeThreads(bb, service, ids, ready);
  registerCli(bb, service);
  bb.background.service("reconcile", {
    async start(signal) {
      await ready;
      while (!signal.aborted) {
        await service.reconcile();
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, RECONCILE_MS);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
      }
    },
  });
  bb.onDispose(() => service.close());
}
