import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { refreshCliCache } from "essentials/cli-cache";
import { cliNames } from "essentials/cli-maintenance";
import { createMaintenanceService } from "essentials/maintenance-service";
import { providerModels } from "../engine/bb/models";
import type { Handlers } from "./contract";

type Sdk = BbPluginApi["sdk"];

// bb has no per-provider command settings, so CLIs resolve from PATH.
const noOverrides = () => Promise.resolve({});
const noOverride = () => Promise.resolve(undefined);

/** Coding CLI versions, updates, and model catalogs. */
export function maintenanceHandlers(sdk: () => Sdk) {
  const service = createMaintenanceService();
  const handlers: Pick<
    Handlers,
    | "cli.status"
    | "cli.check"
    | "cli.update"
    | "cli.models.refresh"
    | "cli.models"
  > = {
    "cli.status": () => service.read(),
    "cli.check": () => service.check(noOverrides),
    "cli.update": ({ id, version }) => service.update(id, version, noOverrides),
    "cli.models.refresh": ({ id }) =>
      service.refresh(id, async (signal) => {
        const warning = await refreshCliCache(id, noOverride, signal);
        const { models, error } = await providerModels(sdk(), id, signal);
        if (error) {
          throw new Error(error);
        }
        return `${cliNames[id]} model picker refreshed: ${models.length} models.${warning}`;
      }),
    async "cli.models"({ id }) {
      try {
        return await providerModels(sdk(), id);
      } catch {
        return {
          models: [],
          error: "bb could not list this provider's models.",
        };
      }
    },
  };
  return { handlers, close: () => service.close() };
}
