import { defineRpc } from "@getpaseo/plugin";
import {
  consumeCodexResetDefinition,
  prepareCodexResetDefinition,
} from "./codex-reset";

export const prepareCodexReset = defineRpc(prepareCodexResetDefinition);
export const consumeCodexReset = defineRpc(consumeCodexResetDefinition);
