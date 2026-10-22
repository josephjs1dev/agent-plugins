import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import {
  deleteSymphonyDefinition,
  listSymphoniesDefinition,
  readSymphonyDefinition,
} from "conductor/symphonies/rpc";

export const listSymphonies = defineRpc(listSymphoniesDefinition);
export const readSymphony = defineRpc(readSymphonyDefinition);
export const deleteSymphony = defineRpc(deleteSymphonyDefinition);
export const getSymphonyAccess = defineRpc({
  name: "symphonies.access",
  input: z.object({}).strict(),
  output: z.object({
    available: z.boolean(),
    commandPath: z.string().nullable(),
    socketPath: z.string().nullable(),
    message: z.string().nullable(),
  }),
});
