import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { answer } from "conductor/agents/answer";
import { archiveInactive } from "conductor/agents/archive";
import { pages } from "conductor/agents/directory";
import type { AgentsHost } from "conductor/agents/host";
import { agentKey } from "conductor/agents/identity";
import { snapshot } from "conductor/agents/snapshot";
import type { AgentsStore } from "conductor/agents/store";
import type { TurnJournal } from "conductor/agents/turns";
import type { ProviderCatalog } from "conductor/symphonies/profiles-contracts";
import { profilesState } from "conductor/symphonies/profile-catalog";
import { SymphonyError } from "conductor/symphonies/errors";
import { listWithProjects } from "conductor/symphonies/projects";
import { ongoingGroups } from "conductor/podium/ongoing";
import type { AgentIds } from "../engine/bb/agent-ids";
import { PODIUM_CHANGED } from "../../shared/signals";
import { podiumContract } from "./podium-contract";
import type { SymphonyService } from "./symphonies";

/** Coalesces bursts of changes into one refetch signal. */
const SIGNAL_DEBOUNCE_MS = 500;

export interface PodiumOptions {
  agents: AgentsHost;
  store: AgentsStore;
  turns: TurnJournal;
  ids: AgentIds;
  service: Pick<SymphonyService, "store" | "profiles">;
  providers: () => Promise<ProviderCatalog>;
}

async function guarded<T>(action: () => Promise<T>, message: string) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof SymphonyError) {
      throw error;
    }
    throw new Error(message);
  }
}

const SYMPHONY_FAILURE =
  "Conductor could not load or save this symphony. Refresh and inspect symphony storage; native requests remain available.";
const PROFILES_FAILURE =
  "Conductor could not load or save the worker profiles. Refresh and check conductor storage.";

/**
 * Serves the Podium's RPCs, records turn outcomes for the Agents queue, and
 * signals the app to refetch when threads or Conductor state change.
 * Returns a signal function for other entrypoints that change state.
 */
export function registerPodium(
  bb: Pick<BbPluginApi, "rpc" | "realtime" | "events" | "onDispose">,
  { agents, store, turns, ids, service, providers }: PodiumOptions,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const changed = () => {
    timer ??= setTimeout(() => {
      timer = null;
      bb.realtime.publish(PODIUM_CHANGED, null);
    }, SIGNAL_DEBOUNCE_MS);
  };
  bb.onDispose(() => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  });
  const signalled = async <T>(action: () => Promise<T>) => {
    try {
      return await action();
    } finally {
      changed();
    }
  };

  const record = (threadId: string, kind: "started" | "completed" | "failed") =>
    void ids
      .agentOf(threadId)
      .then((agentId) =>
        turns.record(agentId, { turnId: null, kind, at: Date.now() }, () =>
          agents.inspect(agentId),
        ),
      )
      // A lost outcome only hides the last-turn badge until the next turn.
      .catch(() => undefined);
  bb.events.on("thread.active", ({ thread }) => {
    record(thread.id, "started");
    changed();
  });
  bb.events.on("thread.idle", ({ thread }) => {
    record(thread.id, "completed");
    changed();
  });
  bb.events.on("thread.failed", ({ thread }) => {
    record(thread.id, "failed");
    changed();
  });
  for (const event of [
    "thread.created",
    "thread.archived",
    "thread.unarchived",
    "thread.deleted",
    "interaction.pending",
  ] as const) {
    bb.events.on(event, changed);
  }

  const list = (concertId?: string) =>
    listWithProjects(
      () => service.store.list(),
      async () => (await pages((cursor) => agents.concerts(cursor))).entries,
      concertId,
    );

  bb.rpc.register(podiumContract, {
    async "agents.get"(input) {
      try {
        return await snapshot(
          agents,
          store,
          input.knownAgentIds,
          Date.now(),
          turns,
        );
      } catch {
        throw new Error(
          "Conductor could not refresh this host. Previous items remain visible; reconnect or check plugin logs.",
        );
      }
    },
    "agents.archive": (input) =>
      signalled(() => archiveInactive(agents, input)),
    "agents.answer": (input) =>
      signalled(() =>
        guarded(
          () => answer(agents, store, input),
          "The request could not be checked or saved. Open the agent to verify its current state.",
        ),
      ),
    "agents.annotate": (input) =>
      signalled(() =>
        guarded(async () => {
          if (input.kind === "snooze") {
            const previous = await store.annotation(input.key);
            await store.annotate({
              key: input.key,
              marked: previous?.marked ?? false,
              until: input.minutes ? Date.now() + input.minutes * 60_000 : null,
            });
          } else {
            const key = agentKey(input.agentId);
            const previous = await store.annotation(key);
            await store.annotate({
              key,
              marked: input.marked,
              until: previous?.until ?? null,
            });
          }
          return {};
        }, "Conductor could not save this Podium preference."),
      ),
    "symphonies.list": (input) =>
      guarded(() => list(input.concertId), SYMPHONY_FAILURE),
    "symphonies.read": ({ id }) =>
      guarded(() => service.store.read(id), SYMPHONY_FAILURE),
    "symphonies.delete": ({ id, version }) =>
      signalled(() =>
        guarded(async () => {
          await service.store.remove(id, version);
          return { deleted: true } as const;
        }, SYMPHONY_FAILURE),
      ),
    "profiles.list": () =>
      guarded(
        async () => profilesState(await service.profiles.load()),
        PROFILES_FAILURE,
      ),
    "profiles.save": (input) =>
      signalled(() =>
        guarded(
          () => service.profiles.save(input.expectedRevision, input.operation),
          PROFILES_FAILURE,
        ),
      ),
    "profiles.providers": () => guarded(providers, PROFILES_FAILURE),
    "agents.thread": async ({ agentId }) => ({
      threadId: await ids.threadOf(agentId),
    }),
    "symphonies.ongoing": ({ threadId }) =>
      guarded(async () => {
        const [agentId, { symphonies }] = await Promise.all([
          ids.agentOf(threadId),
          list(),
        ]);
        const group = ongoingGroups(symphonies, new Set([agentId]));
        return { symphonies: group.get(agentId)?.symphonies ?? [] };
      }, SYMPHONY_FAILURE),
  });
  return changed;
}
