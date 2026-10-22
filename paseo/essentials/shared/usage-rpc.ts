import { defineRpc } from "@getpaseo/plugin";
import { readUsageDefinition } from "essentials/usage";

export const readUsage = defineRpc(readUsageDefinition);
