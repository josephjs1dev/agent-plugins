import { defineRpc } from "@getpaseo/plugin";
import {
  consumeCodexResetDefinition,
  prepareCodexResetDefinition,
} from "essentials/codex-reset";

export const prepareCodexReset = defineRpc(prepareCodexResetDefinition);
export const consumeCodexReset = defineRpc(consumeCodexResetDefinition);
