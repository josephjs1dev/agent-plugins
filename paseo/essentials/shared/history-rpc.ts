import { defineRpc } from "@getpaseo/plugin";
import { readHistoryDefinition } from "essentials/history";

export const readHistory = defineRpc(readHistoryDefinition);
