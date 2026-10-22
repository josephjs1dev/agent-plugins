import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { sessionKey } from "../../history-display";
import {
  createWorkspaceSessions,
  type SessionLink,
} from "../../workspace-sessions";

const NOW = Date.parse("2026-10-09T12:00:00Z");
const seenAt = new Date(NOW).toISOString();

function link(workspaceId: string, sessionId: string): SessionLink {
  return { workspaceId, harness: "claude", sessionId, seenAt };
}

test("recorded links persist and join collected links", async () => {
  const directory = await mkdtemp(join(tmpdir(), "essentials-sessions-"));

  try {
    const sessions = createWorkspaceSessions(directory, () => NOW);
    await sessions.record(link("env_a", "recorded"));
    const read = await sessions.read("env_a", () =>
      Promise.resolve([link("env_a", "listed"), link("env_b", "other")]),
    );
    assert.equal(read.complete, true);
    assert.deepEqual(
      [...read.sessions].sort(),
      [
        sessionKey({ harness: "claude", sessionId: "listed" }),
        sessionKey({ harness: "claude", sessionId: "recorded" }),
      ].sort(),
    );

    const reloaded = createWorkspaceSessions(directory, () => NOW);
    const failing = () => Promise.reject(new Error("offline"));
    const fallback = await reloaded.read("env_b", failing);
    assert.equal(fallback.complete, false);
    assert.equal(fallback.sessions.size, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("each workspace syncs on its own interval", async () => {
  const directory = await mkdtemp(join(tmpdir(), "essentials-sessions-"));

  try {
    const sessions = createWorkspaceSessions(directory, () => NOW);
    const calls: string[] = [];
    const collect = (workspaceId: string) => {
      calls.push(workspaceId);

      return Promise.resolve([]);
    };

    await sessions.read("env_a", collect);
    await sessions.read("env_a", collect);
    await sessions.read("env_b", collect);
    assert.deepEqual(calls, ["env_a", "env_b"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
