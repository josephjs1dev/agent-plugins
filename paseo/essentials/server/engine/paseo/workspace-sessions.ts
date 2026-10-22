import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { z } from "zod";
import { harnessSchema } from "essentials/harnesses";
import {
  createWorkspaceSessions as createSessionStore,
  type SessionLink,
} from "essentials/workspace-sessions";

const MAX_PAGES = 100;
const PAGE_SIZE = 200;

// Only the fields used for attribution; other agent data is ignored.
const agentEntrySchema = z.object({
  agent: z.object({
    workspaceId: z.string().min(1).max(160).optional(),
    provider: z.string(),
    updatedAt: z.string(),
    persistence: z
      .object({ provider: z.string(), sessionId: z.string().min(1).max(160) })
      .nullable()
      .optional(),
  }),
});

// The compiler provides @getpaseo/plugin, not @getpaseo/client.
type AgentList = PluginHandlerContext["paseo"]["agents"]["list"];

export type ListAgents = (
  options: NonNullable<Parameters<AgentList>[0]>,
) => ReturnType<AgentList>;

function agentSession(
  entry: unknown,
  fallbackAt: string,
): SessionLink | undefined {
  const parsed = agentEntrySchema.safeParse(entry);

  if (!parsed.success) {
    return;
  }

  const { workspaceId, persistence, provider, updatedAt } = parsed.data.agent;
  const harness = harnessSchema.safeParse(persistence?.provider ?? provider);

  if (!workspaceId || !persistence || !harness.success) {
    return;
  }

  const seenAt = Number.isNaN(Date.parse(updatedAt))
    ? fallbackAt
    : new Date(updatedAt).toISOString();

  return {
    workspaceId,
    harness: harness.data,
    sessionId: persistence.sessionId,
    seenAt,
  };
}

/** Every Paseo agent's session link, across all workspaces. */
async function agentLinks(
  listAgents: ListAgents,
  now: () => number,
): Promise<SessionLink[]> {
  const syncedAt = new Date(now()).toISOString();
  const links: SessionLink[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await listAgents({
      filter: { includeArchived: true },
      page: { limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) },
    });

    for (const entry of result.entries) {
      const link = agentSession(entry, syncedAt);

      if (link) {
        links.push(link);
      }
    }

    cursor = result.pageInfo.nextCursor ?? undefined;

    if (!result.pageInfo.hasMore || !cursor) {
      break;
    }
  }

  return links;
}

/**
 * Remembers which provider sessions Paseo agents ran in each workspace.
 * Mappings outlive deleted agents so retained history stays attributed.
 */
export function createWorkspaceSessions(
  directory: string,
  now: () => number = Date.now,
) {
  const store = createSessionStore(directory, now);

  return {
    read(workspaceId: string, listAgents: ListAgents, forceSync = false) {
      return store.read(
        workspaceId,
        () => agentLinks(listAgents, now),
        forceSync,
      );
    },
  };
}
