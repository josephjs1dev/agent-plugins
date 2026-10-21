import { defineRpc } from "@getpaseo/plugin";
import { readHistoryDefinition } from "./history";

export const readHistory = defineRpc(readHistoryDefinition);
