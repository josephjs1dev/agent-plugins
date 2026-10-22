import { after } from "node:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentsHost } from "../agents/host";
import type { AgentPermissionRequest, AgentSnapshot } from "../agents/agent";

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
/** A task agent in the domain shape the host ports use. */
export function domainAgent(
  overrides: Partial<AgentSnapshot> = {},
): AgentSnapshot {
  return {
    id: "agent-1",
    concertId: "workspace-1",
    parentAgentId: null,
    provider: "codex",
    status: "idle",
    archived: false,
    awaitingPermission: true,
    title: "API task agent",
    cwd: "/test/repo",
    model: "test-model",
    modeId: null,
    thinkingOptionId: null,
    features: [],
    createdAt: "2026-10-04T12:00:00Z",
    updatedAt: "2026-10-04T12:10:00Z",
    lastUserMessageAt: null,
    attentionTimestamp: "2026-10-04T12:09:00Z",
    lastError: null,
    activeTurn: null,
    sessionId: "session-1",
    pendingPermissions: [question()],
    ...overrides,
  };
}
export function runtime(
  current: () => AgentSnapshot | null,
  overrides: Partial<AgentsHost> = {},
): AgentsHost {
  return {
    agents: async () => {
      const value = current();
      return { entries: value ? [value] : [], next: null };
    },
    concerts: async () => ({ entries: [], next: null }),
    inspect: async () => current(),
    archive: async () => {},
    answer: async () => {},
    ...overrides,
  };
}

const temporaryDirectories: string[] = [];
export async function testDirectory(): Promise<string> {
  // Resolve tmpdir symlinks (macOS /var -> /private/var) so paths match realpath checks.
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), "conductor-test-")),
  );
  temporaryDirectories.push(directory);
  return directory;
}
after(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});
