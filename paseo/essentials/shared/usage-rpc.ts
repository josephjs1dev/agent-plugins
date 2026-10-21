import { defineRpc } from "@getpaseo/plugin";
import { readUsageDefinition } from "./usage";

export const readUsage = defineRpc(readUsageDefinition);
