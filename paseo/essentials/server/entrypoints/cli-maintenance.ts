import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  applyCliUpdate,
  checkCliUpdates,
  readMaintenance,
  refreshCliModels,
} from "../../shared/cli-maintenance-rpc";
import { readMaintenanceHost } from "../../shared/maintenance-host-rpc";
import { createMaintenanceService } from "../core/maintenance-service";
import { refreshModels } from "../engine/paseo/cli-models";
import { readHostIdentity } from "../core/host-identity";

export default function contribute(server: PluginServerContext) {
  const service = createMaintenanceService();
  server.handle(readMaintenanceHost, () => readHostIdentity());
  server.handle(readMaintenance, () => service.read());
  server.handle(checkCliUpdates, (_, { paseo }) =>
    service.check(async () => (await paseo.config.get()).config.providers),
  );
  server.handle(applyCliUpdate, ({ id, version }, { paseo }) =>
    service.update(
      id,
      version,
      async () => (await paseo.config.get()).config.providers,
    ),
  );
  server.handle(refreshCliModels, ({ id, workspaceId }, { paseo }) =>
    service.refresh(id, async (signal) => {
      return refreshModels(id, workspaceId, paseo, signal);
    }),
  );

  return () => service.close();
}
