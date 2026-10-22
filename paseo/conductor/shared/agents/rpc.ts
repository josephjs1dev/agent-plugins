import { defineRpc } from "@getpaseo/plugin";
import {
  annotateDefinition,
  answerRequestDefinition,
  archiveAgentDefinition,
  getAgentsDefinition,
} from "conductor/agents/rpc";

export const getAgents = defineRpc(getAgentsDefinition);
export const archiveAgent = defineRpc(archiveAgentDefinition);
export const answerRequest = defineRpc(answerRequestDefinition);
export const annotate = defineRpc(annotateDefinition);
