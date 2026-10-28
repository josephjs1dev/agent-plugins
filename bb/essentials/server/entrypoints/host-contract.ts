import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  directoryPageSchema,
  directoryRequestSchema,
  searchRequestSchema,
  searchResultSchema,
  fileEntrySchema,
} from "essentials/file-explorer/browser";
import { gitStatusResultSchema } from "essentials/file-explorer/git";
import { method } from "./contract";

/** The environment's checkout on its host, resolved by the server. */
const rootPath = z
  .string()
  .min(1)
  .max(4096)
  .refine((path) => path.startsWith("/"), "Expected an absolute path");

/**
 * The RPCs of the host entry (`host.ts`). bb runs it on each enrolled host,
 * and the server calls it with the environment's `hostId`.
 */
export const hostContract = defineRpcContract({
  "file_explorer.directory": method({
    input: directoryRequestSchema.extend({ rootPath }).strict(),
    output: directoryPageSchema,
  }),
  "file_explorer.search": method({
    input: searchRequestSchema.extend({ rootPath }).strict(),
    output: searchResultSchema,
  }),
  "file_explorer.git_status": method({
    input: z.object({ rootPath }).strict(),
    output: gitStatusResultSchema,
  }),
  "file_explorer.delete": method({
    input: z.object({ rootPath, entry: fileEntrySchema }).strict(),
    output: z.object({ path: z.string() }),
  }),
});
export type HostContract = typeof hostContract;
