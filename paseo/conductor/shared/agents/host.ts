import type { AgentPermissionResponse, AgentSnapshot } from "./agent";
import type { ConcertEntry } from "../concert";

export interface Directory<T> {
  entries: T[];
  next: string | null;
}

/** Paseo operations that the Podium's Agents section needs. server/engine/paseo/agents-host.ts implements it. */
export interface AgentsHost {
  agents(cursor?: string): Promise<Directory<AgentSnapshot>>;
  concerts(cursor?: string): Promise<Directory<ConcertEntry>>;
  inspect(agentId: string): Promise<AgentSnapshot | null>;
  archive(agentId: string): Promise<void>;
  answer(
    agentId: string,
    requestId: string,
    response: AgentPermissionResponse,
  ): Promise<void>;
}
