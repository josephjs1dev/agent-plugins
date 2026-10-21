import { defineRpc } from "@getpaseo/plugin";
import {
  applyCliUpdateDefinition,
  checkCliUpdatesDefinition,
  readMaintenanceDefinition,
  refreshCliModelsDefinition,
} from "./cli-maintenance";

export const readMaintenance = defineRpc(readMaintenanceDefinition);
export const checkCliUpdates = defineRpc(checkCliUpdatesDefinition);
export const applyCliUpdate = defineRpc(applyCliUpdateDefinition);
export const refreshCliModels = defineRpc(refreshCliModelsDefinition);
