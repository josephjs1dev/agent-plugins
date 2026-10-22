import { useMemo } from "react";
import type {
  AgentItem,
  ArchiveResult,
  Decision,
} from "conductor/agents/models";
import { usePodiumRpc } from "../data";
import { usePodium } from "../podium/context";

/** What the request detail can do to an item. */
export interface DetailActions {
  openAgent(this: void, agentId: string): void;
  answer(this: void, item: AgentItem, decision: Decision): Promise<void>;
  snooze(this: void, item: AgentItem, minutes: 0 | 15 | 60): Promise<void>;
  mark(this: void, item: AgentItem): Promise<void>;
  archive(this: void, item: AgentItem): Promise<ArchiveResult>;
}

/**
 * The detail's RPC actions. Each one refreshes the snapshot afterwards; an
 * answer records its delivery as a session notice, so the draft and the
 * notice outlive the item when the request resolves.
 */
export function useDetailActions(refresh: () => void): DetailActions {
  const rpc = usePodiumRpc();
  const { session, openAgent } = usePodium();
  return useMemo(
    () => ({
      openAgent: (agentId: string) => openAgent(agentId),
      async answer(item, decision) {
        if (!item.requestId) {
          return;
        }
        session.notice(item.key, "sending");
        try {
          const result = await rpc.call("agents.answer", {
            key: item.key,
            agentId: item.agentId,
            requestId: item.requestId,
            decision,
          });
          session.notice(item.key, result.status);
        } catch {
          session.notice(item.key, "unknown");
        }
        refresh();
      },
      async snooze(item, minutes) {
        try {
          await rpc.call("agents.annotate", {
            kind: "snooze",
            key: item.key,
            minutes,
          });
        } finally {
          refresh();
        }
      },
      async mark(item) {
        try {
          await rpc.call("agents.annotate", {
            kind: "mark",
            agentId: item.agentId,
            marked: !item.marked,
          });
        } finally {
          refresh();
        }
      },
      async archive(item) {
        if (!item.archiveKey) {
          return { status: "stale" };
        }
        try {
          const result = await rpc.call("agents.archive", {
            agentId: item.agentId,
            key: item.archiveKey,
          });
          if (result.status === "archived") {
            session.update({ selectedKey: null });
          }
          return result;
        } finally {
          refresh();
        }
      },
    }),
    [rpc, session, openAgent, refresh],
  );
}
