import type { BbKv } from "./types";

/**
 * Conductor chooses a task agent's ID before launch; bb assigns thread IDs.
 * This map links the two. An ID without an entry is a thread ID, such as the
 * source thread that started a symphony.
 */
export function agentIds(kv: BbKv) {
  return {
    async threadOf(agentId: string): Promise<string> {
      return (await kv.get<string>(`agent:${agentId}`)) ?? agentId;
    },
    async agentOf(threadId: string): Promise<string> {
      return (await kv.get<string>(`thread:${threadId}`)) ?? threadId;
    },
    async bound(agentId: string): Promise<boolean> {
      return (await kv.get<string>(`agent:${agentId}`)) != null;
    },
    async bind(agentId: string, threadId: string): Promise<void> {
      await kv.set(`agent:${agentId}`, threadId);
      await kv.set(`thread:${threadId}`, agentId);
    },
  };
}
export type AgentIds = ReturnType<typeof agentIds>;
