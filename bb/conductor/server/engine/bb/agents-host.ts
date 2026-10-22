import type { AgentSnapshot } from "conductor/agents/agent";
import type { AgentsHost } from "conductor/agents/host";
import type { HostVocabulary } from "conductor/agents/vocabulary";
import type { AgentIds } from "./agent-ids";
import { toPermissionRequest, toResolution } from "./interactions";
import { toAgentSnapshot } from "./mapping";
import { threadReads } from "./threads";
import type { BbSdk, BbThreadRow } from "./types";

const PAGE = 200;
/** Parallel reads per batch, as in the core's directory inspection. */
const BATCH = 10;

export interface BbAgentsHostOptions {
  sdk: () => BbSdk;
  ids: AgentIds;
  vocabulary: HostVocabulary;
}

async function batched<T, R>(
  items: T[],
  map: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += BATCH) {
    results.push(
      ...(await Promise.all(items.slice(start, start + BATCH).map(map))),
    );
  }
  return results;
}

function offsetOf(cursor: string | undefined): number {
  const offset = Number(cursor ?? 0);
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
}

/** A thread waits on an approval or question only during a turn. */
function mayAwait(thread: BbThreadRow): boolean {
  return ["active", "starting", "stopping"].includes(thread.status);
}

/** The Podium's Agents port on bb: agents are threads, concerts are environments. */
export function bbAgentsHost({
  sdk,
  ids,
  vocabulary,
}: BbAgentsHostOptions): AgentsHost {
  const reads = threadReads(sdk);

  async function pending(thread: BbThreadRow) {
    if (!mayAwait(thread)) {
      return [];
    }
    try {
      const interactions = await sdk().threads.interactions.list({
        threadId: thread.id,
      });
      return interactions
        .filter((interaction) => interaction.status === "pending")
        .map((interaction) =>
          toPermissionRequest(
            interaction,
            vocabulary.providerFromHost(thread.providerId),
          ),
        );
    } catch {
      return [];
    }
  }

  /** A listing reads no execution options; inspection reads them. */
  async function snapshot(
    thread: BbThreadRow,
    paths: Map<string, Promise<string>>,
    inspect: boolean,
  ): Promise<AgentSnapshot> {
    const environmentId = thread.environmentId;
    let cwd = Promise.resolve("");
    if (environmentId) {
      cwd = paths.get(environmentId) ?? reads.environmentPath(environmentId);
      paths.set(environmentId, cwd);
    }
    const [agentId, parentAgentId, path, permissions, options] =
      await Promise.all([
        ids.agentOf(thread.id),
        thread.parentThreadId ? ids.agentOf(thread.parentThreadId) : null,
        cwd,
        pending(thread),
        inspect ? reads.executionOptions(thread.id) : null,
      ]);
    const agent = toAgentSnapshot(thread, {
      agentId,
      parentAgentId,
      cwd: path,
      model: options?.model ?? null,
      permissionMode: options?.permissionMode ?? null,
      reasoningLevel: options?.reasoningLevel ?? null,
      pendingPermissions: permissions,
    });
    return {
      ...agent,
      provider: vocabulary.providerFromHost(agent.provider),
      modeId:
        agent.modeId === null ? null : vocabulary.modeFromHost(agent.modeId),
    };
  }

  return {
    async agents(cursor) {
      const offset = offsetOf(cursor);
      const threads = await sdk().threads.list({
        archived: false,
        includeHidden: true,
        limit: PAGE,
        offset,
      });
      const paths = new Map<string, Promise<string>>();
      return {
        entries: await batched(threads, (thread) =>
          snapshot(thread, paths, false),
        ),
        next: threads.length === PAGE ? String(offset + PAGE) : null,
      };
    },
    async concerts(cursor) {
      const offset = offsetOf(cursor);
      const [environments, projects] = await Promise.all([
        sdk().environments.list({ limit: PAGE, offset }),
        sdk().projects.list(),
      ]);
      const names = new Map(
        projects.map((project) => [project.id, project.name]),
      );
      return {
        entries: environments.map((environment) => ({
          id: environment.id,
          name:
            environment.name ??
            environment.branchName ??
            environment.path ??
            environment.id,
          projectName: names.get(environment.projectId) ?? "Other agents",
        })),
        next: environments.length === PAGE ? String(offset + PAGE) : null,
      };
    },
    async inspect(agentId) {
      const thread = await reads.thread(await ids.threadOf(agentId));
      return thread ? snapshot(thread, new Map(), true) : null;
    },
    async archive(agentId) {
      await sdk().threads.archive({ threadId: await ids.threadOf(agentId) });
    },
    async answer(agentId, requestId, response) {
      const threadId = await ids.threadOf(agentId);
      const interaction = await sdk().threads.interactions.get({
        threadId,
        interactionId: requestId,
      });
      const resolution = toResolution(interaction, response);
      if (!resolution) {
        throw new Error(`Unsupported response for interaction ${requestId}`);
      }
      await sdk().threads.interactions.resolve({
        threadId,
        interactionId: requestId,
        resolution,
      });
    },
  };
}
