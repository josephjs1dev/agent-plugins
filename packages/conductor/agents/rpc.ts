import { z } from "zod";
import { identifier } from "../schema";
import {
  answerInputSchema,
  answerResultSchema,
  archiveResultSchema,
  keySchema,
  snapshotSchema,
} from "./models";

/** The Podium's Agents RPCs. Each host wraps these with its RPC transport. */
export const getAgentsDefinition = {
  name: "agents.get",
  input: z.object({ knownAgentIds: z.array(identifier).max(2000).default([]) }),
  output: snapshotSchema,
};
export const archiveAgentDefinition = {
  name: "agents.archive",
  input: z.object({ agentId: identifier, key: keySchema }),
  output: archiveResultSchema,
};
export const answerRequestDefinition = {
  name: "agents.answer",
  input: answerInputSchema,
  output: answerResultSchema,
};
export const annotateDefinition = {
  name: "agents.annotate",
  input: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("snooze"),
      key: keySchema,
      minutes: z.union([z.literal(0), z.literal(15), z.literal(60)]),
    }),
    z.object({
      kind: z.literal("mark"),
      agentId: identifier,
      marked: z.boolean(),
    }),
  ]),
  output: z.object({}),
};
