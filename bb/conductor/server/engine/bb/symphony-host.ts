import type { SymphonyHost } from "conductor/symphonies/host";
import { LaunchRejectedError } from "conductor/symphonies/errors";
import type { AgentIds } from "./agent-ids";
import { narrowerMode, permissionMode, toAgentSnapshot } from "./mapping";
import type { BbKv, BbSdk, BbThread } from "./types";

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

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const { status, code, message } = error as Record<string, unknown>;
  return (
    status === 404 ||
    (typeof code === "string" && /not[_ ]?found/i.test(code)) ||
    (typeof message === "string" && /not[_ ]?found|\b404\b/i.test(message))
  );
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

  async function thread(threadId: string): Promise<BbThread | null> {
    try {
      return await sdk().threads.get({ threadId });
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async function executionOptions(threadId: string) {
    try {
      return await sdk().threads.defaultExecutionOptions({ threadId });
    } catch {
      return null;
    }
  }

  async function environmentPath(environmentId: string | null) {
    if (!environmentId) {
      return "";
    }
    try {
      return (await sdk().environments.get({ environmentId })).path ?? "";
    } catch {
      return "";
    }
  }

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
      // Never let an unset mode fall back to a broader project default, and
      // never give a task thread a broader mode than its Conductor thread.
      const parentMode = permissionMode(parentOptions?.permissionMode);
      const requested = permissionMode(input.config.modeId) ?? parentMode;
      let mode = requested ?? FALLBACK_MODE;
      if (parentMode) {
        mode = narrowerMode(mode, parentMode);
      }
      const spawned = await sdk().threads.spawn({
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
        startedOnBehalfOf: {
          initiator: "agent",
          senderThreadId: parentThreadId,
        },
        pluginMetadata: { [AGENT_ID_KEY]: input.agentId },
      });
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
