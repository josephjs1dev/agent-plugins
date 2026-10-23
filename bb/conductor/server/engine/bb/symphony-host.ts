import type { SymphonyHost } from "conductor/symphonies/host";
import { LaunchRejectedError } from "conductor/symphonies/errors";
import type { AgentIds } from "./agent-ids";
import {
  narrowerMode,
  permissionMode,
  providerModes,
  supportedMode,
  toAgentSnapshot,
} from "./mapping";
import { isNotFound, threadReads } from "./threads";
import type { BbKv, BbPermissionMode, BbSdk } from "./types";

/** Seeded on each task thread so a lost ID binding can be recovered. */
const AGENT_ID_KEY = "conductorAgentId";

/** The least permissive bb mode; used when neither profile nor parent sets one. */
const FALLBACK_MODE = "accept-edits";

export interface BbHostOptions {
  sdk: () => BbSdk;
  ids: AgentIds;
  kv: BbKv;
  pluginId: string;
}

function providerAndModel(selection: string) {
  const separator = selection.indexOf("/");
  return separator === -1
    ? { providerId: selection, model: undefined }
    : {
        providerId: selection.slice(0, separator),
        model: selection.slice(separator + 1),
      };
}

/**
 * Runs a thread spawn. bb's refusal of the request (a 4xx other than timeout
 * or rate limit) created no thread, so it rejects the launch with bb's reason
 * instead of leaving it uncertain.
 */
async function spawnOrReject<T>(spawn: () => Promise<T>): Promise<T> {
  try {
    return await spawn();
  } catch (error) {
    const status = (error as { status?: unknown } | null)?.status;
    if (
      typeof status === "number" &&
      status >= 400 &&
      status < 500 &&
      status !== 408 &&
      status !== 429
    ) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new LaunchRejectedError(`bb refused the task thread: ${reason}`);
    }
    throw error;
  }
}

/** Conductor's symphony host port on bb: agents are threads, concerts are environments. */
export function bbSymphonyHost({
  sdk,
  ids,
  kv,
  pluginId,
}: BbHostOptions): SymphonyHost {
  let primaryHostId: Promise<string | null> | null = null;
  const localHost = () =>
    (primaryHostId ??= sdk()
      .system.config()
      .then((config) => config.primaryHostId ?? null)
      .catch(() => {
        primaryHostId = null;
        return null;
      }));

  const { thread, executionOptions, environmentPath } = threadReads(sdk);

  /** Finds a task thread whose binding was lost between spawn and bind. */
  async function recover(
    agentId: string,
    parentThreadId: string,
  ): Promise<string | null> {
    const children = await sdk().threads.list({
      parentThreadId,
      originPluginId: pluginId,
      includeHidden: true,
      archived: false,
      limit: 200,
    });
    const threadIds = children.map((child) => child.id);
    if (threadIds.length === 0) {
      return null;
    }
    const { threads } = await sdk().threads.experimental_listPluginMetadata({
      pluginId,
      threadIds,
    });
    return (
      threads.find((entry) => entry.metadata[AGENT_ID_KEY] === agentId)
        ?.threadId ?? null
    );
  }

  /**
   * The task thread's permission mode. An unset mode never falls back to a
   * broader project default, and a task thread never gets a broader mode than
   * its Conductor thread. Within that ceiling, a provider that does not run
   * the intended mode gets the next broader mode it runs.
   */
  async function launchMode(
    providerId: string,
    modeId: string | undefined,
    parentMode: BbPermissionMode | null,
  ): Promise<BbPermissionMode> {
    let intended = permissionMode(modeId) ?? parentMode ?? FALLBACK_MODE;
    if (parentMode) {
      intended = narrowerMode(intended, parentMode);
    }
    const ceiling = parentMode ?? intended;
    const provider = (await sdk().providers.list()).find(
      (entry) => entry.id === providerId,
    );
    const supported = providerModes(provider);
    const mode = supportedMode(intended, ceiling, supported);
    if (!mode) {
      throw new LaunchRejectedError(
        `Provider ${providerId} runs only the ${supported.join(", ")} permission mode, broader than the ${ceiling} mode its Conductor thread allows. Run the Conductor thread in a broader mode, or route the task to a profile on another provider.`,
      );
    }
    return mode;
  }

  return {
    async agent(agentId) {
      const value = await thread(await ids.threadOf(agentId));
      if (!value) {
        return null;
      }
      const [options, cwd, parentAgentId] = await Promise.all([
        executionOptions(value.id),
        environmentPath(value.environmentId),
        value.parentThreadId ? ids.agentOf(value.parentThreadId) : null,
      ]);
      return toAgentSnapshot(value, {
        agentId,
        parentAgentId,
        cwd,
        model: options?.model ?? null,
        permissionMode: options?.permissionMode ?? null,
        reasoningLevel: options?.reasoningLevel ?? null,
      });
    },
    async concert(concertId) {
      try {
        const environment = await sdk().environments.get({
          environmentId: concertId,
        });
        // Placement and change tracking read the checkout with local git, so
        // only an environment on the bb server's own machine has a directory.
        const local = environment.hostId === (await localHost());
        return {
          id: environment.id,
          name:
            environment.name ??
            environment.branchName ??
            environment.path ??
            environment.id,
          directory: local ? environment.path : null,
        };
      } catch (error) {
        if (isNotFound(error)) {
          return null;
        }
        throw error;
      }
    },
    // bb has no host agent profiles; Conductor profiles live in its own store.
    async profiles() {
      return [];
    },
    async providers() {
      return (await sdk().providers.list()).map((provider) => ({
        provider: provider.id,
        available: provider.available,
      }));
    },
    async models(provider) {
      const { models } = await sdk().providers.models({ providerId: provider });
      return models.map((entry) => entry.model);
    },
    async modes(provider) {
      return providerModes(
        (await sdk().providers.list()).find((entry) => entry.id === provider),
      );
    },
    async createAgent(input) {
      if (await ids.bound(input.agentId)) {
        // bb has no keyed creation; the bound thread already has its prompt.
        return;
      }
      if (!input.parentAgentId) {
        throw new LaunchRejectedError(
          "A task agent requires its Conductor parent.",
        );
      }
      const parentThreadId = await ids.threadOf(input.parentAgentId);
      const recovered = await recover(input.agentId, parentThreadId);
      if (recovered) {
        await ids.bind(input.agentId, recovered);
        return;
      }
      const parent = await thread(parentThreadId);
      if (!parent) {
        throw new LaunchRejectedError(
          `Task agent parent is unavailable: ${input.parentAgentId}`,
        );
      }
      const parentOptions = await executionOptions(parentThreadId);
      const { providerId, model } = providerAndModel(input.config.provider);
      const mode = await launchMode(
        providerId,
        input.config.modeId,
        permissionMode(parentOptions?.permissionMode),
      );
      // bb accepts `startedOnBehalfOf` only on forks; `parentThreadId` links
      // the task thread to its Conductor thread.
      const spawned = await spawnOrReject(() =>
        sdk().threads.spawn({
          projectId: parent.projectId,
          environment: { type: "reuse", environmentId: input.concertId },
          parentThreadId,
          title: input.title,
          prompt: input.prompt,
          providerId,
          ...(model ? { model } : {}),
          permissionMode: mode,
          ...(input.config.thinkingOptionId
            ? { reasoningLevel: input.config.thinkingOptionId }
            : {}),
          pluginMetadata: { [AGENT_ID_KEY]: input.agentId },
        }),
      );
      await ids.bind(input.agentId, spawned.id);
    },
    async send(agentId, prompt, messageId) {
      // bb does not deduplicate sends; a replayed wake keeps its message ID.
      const key = `sent:${messageId}`;
      if ((await kv.get<number>(key)) != null) {
        return;
      }
      await sdk().threads.send({
        threadId: await ids.threadOf(agentId),
        mode: "auto",
        input: [{ type: "text", text: prompt, mentions: [] }],
      });
      await kv.set(key, Date.now());
    },
  };
}
