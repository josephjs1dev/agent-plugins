import { z } from "zod";

const idSchema = z.string().min(1).max(256);

/**
 * What an Explorer or Search panel reads: a thread's environment, or the
 * default checkout of the project selected on the New thread screen.
 */
export const explorerTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("thread"), threadId: idSchema }).strict(),
  z.object({ kind: z.literal("project"), projectId: idSchema }).strict(),
]);
export type ExplorerTarget = z.infer<typeof explorerTargetSchema>;

/**
 * The root that the server resolved for a target. A view compares `key` to
 * notice that the root changed. `preview` is the base of bb's file target.
 */
export const explorerRootSchema = z.object({
  key: z.string().min(1).max(300),
  preview: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("workspace"), environmentId: idSchema }),
    z.object({
      kind: z.literal("host"),
      hostId: idSchema,
      path: z.string().min(1).max(4096),
    }),
  ]),
});
export type ExplorerRoot = z.infer<typeof explorerRootSchema>;
