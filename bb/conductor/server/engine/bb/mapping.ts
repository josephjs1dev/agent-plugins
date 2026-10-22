import type { AgentSnapshot, AgentStatus } from "conductor/agents/agent";
import type { BbPermissionMode, BbThread } from "./types";

const permissionModes = new Set<string>(["accept-edits", "auto", "full"]);

const modeRank: Record<BbPermissionMode, number> = {
  "accept-edits": 0,
  auto: 1,
  full: 2,
};

/** The narrower of two bb permission modes. */
export function narrowerMode(
  a: BbPermissionMode,
  b: BbPermissionMode,
): BbPermissionMode {
  return modeRank[a] <= modeRank[b] ? a : b;
}

/** The bb permission mode for a bb mode ID, or null when it is not one. */
export function permissionMode(
  modeId: string | null | undefined,
): BbPermissionMode | null {
  return modeId && permissionModes.has(modeId)
    ? (modeId as BbPermissionMode)
    : null;
}

function agentStatus(thread: BbThread): AgentStatus {
  if (thread.deletedAt !== null) {
    return "closed";
  }
  switch (thread.status) {
    case "active":
    case "starting":
    case "stopping":
      return "running";
    case "pending":
      return "initializing";
    case "error":
      return "error";
    default:
      return "idle";
  }
}

export interface ThreadFacts {
  agentId: string;
  parentAgentId: string | null;
  cwd: string;
  model: string | null;
  permissionMode: string | null;
  reasoningLevel: string | null;
}

/** Translate one bb thread into the Conductor domain shape. */
export function toAgentSnapshot(
  thread: BbThread,
  facts: ThreadFacts,
): AgentSnapshot {
  const status = agentStatus(thread);
  return {
    id: facts.agentId,
    concertId: thread.environmentId,
    parentAgentId: facts.parentAgentId,
    provider: thread.providerId,
    status,
    archived: thread.archivedAt !== null || thread.deletedAt !== null,
    awaitingPermission: false,
    title: thread.title ?? thread.titleFallback ?? null,
    cwd: facts.cwd,
    model: facts.model,
    modeId: facts.permissionMode,
    thinkingOptionId: facts.reasoningLevel,
    features: [],
    createdAt: new Date(thread.createdAt).toISOString(),
    updatedAt: new Date(thread.updatedAt).toISOString(),
    lastUserMessageAt: null,
    attentionTimestamp: null,
    lastError: null,
    activeTurn:
      status === "running"
        ? { turnId: `${thread.id}:active`, startedAt: null }
        : null,
    sessionId: null,
    pendingPermissions: [],
  };
}
