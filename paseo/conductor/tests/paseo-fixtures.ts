import type {
  AgentPermissionRequest,
  PaseoAgent,
} from "../server/engine/paseo/types";
import type { AgentSnapshot } from "../shared/agents/agent";
import { toAgentSnapshot } from "../server/engine/paseo/mapping";

export { runtime, testDirectory } from "./fixtures";

export function question(
  overrides: Partial<AgentPermissionRequest> = {},
): AgentPermissionRequest {
  return {
    id: "request-1",
    provider: "codex",
    kind: "question",
    name: "request_user_input",
    title: "Choose pagination",
    input: {
      questions: [
        {
          header: "Pagination",
          question: "Which pagination behavior should we use?",
          options: [
            { label: "Cursor", description: "Stable during changes" },
            { label: "Offset" },
          ],
          isOther: true,
        },
      ],
    },
    ...overrides,
  };
}
export function agent(overrides: Partial<PaseoAgent> = {}): PaseoAgent {
  return {
    id: "agent-1",
    provider: "codex",
    cwd: "/test/repo",
    workspaceId: "workspace-1",
    title: "API task agent",
    model: "test-model",
    createdAt: "2026-10-04T12:00:00Z",
    updatedAt: "2026-10-04T12:10:00Z",
    lastUserMessageAt: null,
    status: "idle",
    capabilities: {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: false,
      supportsMcpServers: true,
      supportsReasoningStream: false,
      supportsToolInvocations: true,
    },
    currentModeId: null,
    availableModes: [],
    pendingPermissions: [question()],
    persistence: { provider: "codex", sessionId: "session-1" },
    labels: {},
    requiresAttention: true,
    attentionReason: "permission",
    attentionTimestamp: "2026-10-04T12:09:00Z",
    ...overrides,
  };
}
/** The Paseo fixtures translated into the domain shape the host ports use. */
export function domainAgent(
  overrides: Partial<PaseoAgent> = {},
): AgentSnapshot {
  return toAgentSnapshot(agent(overrides));
}
