import assert from "node:assert/strict";
import test from "node:test";
import type { CreateAgentInput, SymphonyHost } from "../symphonies/host";
import type { AgentSnapshot } from "../agents/agent";
import {
  hostVocabulary,
  normalizeMode,
  translatedHost,
} from "../agents/vocabulary";
import { LaunchRejectedError } from "../symphonies/errors";

const vocabulary = hostVocabulary({
  providers: { claude: "claude-code" },
  modesToHost: { "bypass-permissions": "full", auto: "auto" },
  modesFromHost: { full: "full-access" },
});

function fakeHost() {
  const created: CreateAgentInput[] = [];
  const modelCalls: string[] = [];
  const host: SymphonyHost = {
    agent: async (agentId) =>
      ({
        id: agentId,
        provider: "claude-code",
        modeId: "full",
      }) as AgentSnapshot,
    concert: async () => null,
    profiles: async () => [],
    providers: async () => [
      { provider: "claude-code", available: true },
      { provider: "codex", available: false },
    ],
    models: async (provider) => {
      modelCalls.push(provider);
      return ["claude-opus-5-5"];
    },
    modes: async () => ["accept-edits", "full"],
    createAgent: async (input) => {
      created.push(input);
    },
    send: async () => {},
  };
  return { host, created, modelCalls };
}

const launch: CreateAgentInput = {
  agentId: "agent-1",
  concertId: "concert-1",
  parentAgentId: "parent",
  title: "Task",
  prompt: "Work.",
  config: { provider: "claude/claude-opus-5-5", modeId: "bypassPermissions" },
};

void test("modes compare equal across camel, snake and kebab case", () => {
  assert.equal(normalizeMode("bypassPermissions"), "bypass-permissions");
  assert.equal(normalizeMode("bypass_permissions"), "bypass-permissions");
  assert.equal(normalizeMode("auto-review"), "auto-review");
});

void test("the core sees store IDs and the host receives its own", async () => {
  const { host, created, modelCalls } = fakeHost();
  const translated = translatedHost(host, vocabulary);

  const agent = await translated.agent("agent-1");
  assert.equal(agent?.provider, "claude");
  assert.equal(agent?.modeId, "full-access");
  assert.deepEqual(await translated.providers(), [
    { provider: "claude", available: true },
    { provider: "codex", available: false },
  ]);
  await translated.models("claude", "/repo");
  assert.deepEqual(modelCalls, ["claude-code"]);

  await translated.createAgent(launch);
  assert.deepEqual(created[0]?.config, {
    provider: "claude-code/claude-opus-5-5",
    modeId: "full",
  });
});

void test("a mode without a host equivalent rejects the launch", async () => {
  const { host, created } = fakeHost();
  const translated = translatedHost(host, vocabulary);

  await assert.rejects(
    translated.createAgent({
      ...launch,
      config: { provider: "codex", modeId: "plan" },
    }),
    LaunchRejectedError,
  );
  assert.equal(created.length, 0);
});

void test("unlisted providers pass through unchanged", async () => {
  const { host, created } = fakeHost();

  await translatedHost(host, vocabulary).createAgent({
    ...launch,
    config: { provider: "codex/gpt-6.1-sol" },
  });
  assert.deepEqual(created[0]?.config, { provider: "codex/gpt-6.1-sol" });
});
