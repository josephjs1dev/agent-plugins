import { defineRpc } from "@getpaseo/plugin";
import { readMaintenanceHostDefinition } from "essentials/maintenance-host";

export const readMaintenanceHost = defineRpc(readMaintenanceHostDefinition);
