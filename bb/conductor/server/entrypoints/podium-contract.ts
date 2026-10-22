import { defineRpcContract, type StandardSchemaV1 } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { identifier } from "conductor/schema";
import {
  annotateDefinition,
  answerRequestDefinition,
  archiveAgentDefinition,
  getAgentsDefinition,
} from "conductor/agents/rpc";
import {
  listProfileProvidersDefinition,
  listProfilesDefinition,
  saveProfilesDefinition,
} from "conductor/symphonies/profiles-rpc";
import {
  deleteSymphonyDefinition,
  listSymphoniesDefinition,
  readSymphonyDefinition,
} from "conductor/symphonies/rpc";

interface Typed {
  "~standard": { types?: { input: unknown; output: unknown } | undefined };
}
type Standard<Schema extends Typed> = StandardSchemaV1<
  NonNullable<Schema["~standard"]["types"]>["input"],
  NonNullable<Schema["~standard"]["types"]>["output"]
>;

/**
 * Zod types an issue path as `?: ... | undefined`, which bb's Standard Schema
 * type rejects under `exactOptionalPropertyTypes`. The runtime contract is
 * the same, so keep the inferred input and output types and cast the rest.
 */
function method<Input extends Typed, Output extends Typed>(definition: {
  input: Input;
  output: Output;
}) {
  return {
    input: definition.input as unknown as Standard<Input>,
    output: definition.output as unknown as Standard<Output>,
  };
}

/**
 * The Podium RPCs on bb, keyed by the core definitions' names. bb has no
 * Paseo agent profiles, so the profile import and sync RPCs are absent.
 */
export const podiumContract = defineRpcContract({
  "agents.get": method(getAgentsDefinition),
  "agents.archive": method(archiveAgentDefinition),
  "agents.answer": method(answerRequestDefinition),
  "agents.annotate": method(annotateDefinition),
  "symphonies.list": method(listSymphoniesDefinition),
  "symphonies.read": method(readSymphonyDefinition),
  "symphonies.delete": method(deleteSymphonyDefinition),
  "profiles.list": method(listProfilesDefinition),
  "profiles.save": method(saveProfilesDefinition),
  "profiles.providers": method(listProfileProvidersDefinition),
  // bb-only: a task agent's ID differs from its thread ID.
  "agents.thread": method({
    input: z.object({ agentId: identifier }).strict(),
    output: z.object({ threadId: z.string() }),
  }),
});
export type PodiumContract = typeof podiumContract;
