import { z } from "zod";
import { identifier } from "../schema";
import {
  contextSchema,
  SYMPHONY_LIMITS,
  symphonyListEntrySchema,
  symphonySchema,
  uuidSchema,
} from "./models";

/** The Podium's Symphonies RPCs. Each host wraps these with its RPC transport. */
export const listSymphoniesDefinition = {
  name: "symphonies.list",
  input: z.object({ concertId: identifier.optional() }).strict(),
  output: z.object({
    symphonies: z
      .array(symphonyListEntrySchema)
      .max(SYMPHONY_LIMITS.symphonies),
    unavailable: z.number().int().nonnegative(),
    incomplete: z.boolean(),
  }),
};
export const readSymphonyDefinition = {
  name: "symphonies.read",
  input: z.object({ id: uuidSchema }).strict(),
  output: z.object({ symphony: symphonySchema, context: contextSchema }),
};
export const deleteSymphonyDefinition = {
  name: "symphonies.delete",
  input: z
    .object({
      id: uuidSchema,
      version: z.number().int().nonnegative(),
    })
    .strict(),
  output: z.object({ deleted: z.literal(true) }),
};
