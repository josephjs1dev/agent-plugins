import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { agentIds } from "../server/engine/bb/agent-ids";
import { bbSymphonyHost } from "../server/engine/bb/symphony-host";
import { bbVocabulary } from "../shared/vocabulary";
import { translatedHost } from "conductor/agents/vocabulary";
import { LaunchRejectedError } from "conductor/symphonies/errors";
import type { ConductorProfile } from "conductor/symphonies/profiles";
import { workerRuntime } from "conductor/symphonies/workers";

const parent = makeThreadResponse({
  id: "thr_parent",
  projectId: "proj_1",
  environmentId: "env_1",
  providerId: "claude-code",
  status: "active",
});

function fixture(overrides: Record<string, unknown> = {}) {
  const threads = new Map([[parent.id, parent]]);
  const { bb, harness } = createFakePluginHost({
    pluginId: "conductor",
    sdk: {
      system: { config: async () => ({ primaryHostId: "host_local" }) },
      threads: {
        get: async ({ threadId }: { threadId: string }) => {
          const value = threads.get(threadId);
          if (!value) {
            throw Object.assign(new Error("Thread not found"), { status: 404 });
          }
          return value;
        },
        defaultExecutionOptions: async () => ({
          model: "opus",
          permissionMode: "auto",
          reasoningLevel: "high",
          serviceTier: "default",
          source: "client/thread/start",
        }),
        list: async () => [],
        experimental_listPluginMetadata: async () => ({ threads: [] }),
        spawn: async (args: { title?: string | undefined }) => {
          const child = makeThreadResponse({
            id: `thr_child_${threads.size}`,
            parentThreadId: parent.id,
            environmentId: "env_1",
            providerId: "codex",
            status: "pending",
            title: args.title ?? null,
          });
          threads.set(child.id, child);
          return child;
        },
        send: async () => ({}),
      },
      environments: {
        get: async ({ environmentId }: { environmentId: string }) => ({
          id: environmentId,
          hostId: environmentId === "env_remote" ? "host_remote" : "host_local",
          name: "main",
          branchName: null,
          path: "/work/repo",
        }),
      },
      providers: {
        list: async () => [{ id: "codex", available: true }],
        models: async () => ({
          models: [{ id: "codex:gpt", model: "gpt" }],
          modelLoadError: null,
        }),
      },
      ...overrides,
    },
  });
  const ids = agentIds(bb.storage.kv);
  const host = bbSymphonyHost({
    sdk: () => bb.sdk,
    ids,
    kv: bb.storage.kv,
    pluginId: "conductor",
  });
  return { bb, harness, ids, host };
}

const launch = {
  agentId: "6f1c2d3e-0000-8000-8000-000000000001",
  concertId: "env_1",
  parentAgentId: parent.id,
  title: "Implement the parser",
  prompt: "Do the work.",
  config: { provider: "codex/gpt" },
};

void test("createAgent spawns one child thread in the parent's environment", async () => {
  const { harness, host, ids } = fixture();

  await host.createAgent(launch);
  await host.createAgent(launch);

  const spawns = harness.inspection.sdk.callsTo("threads.spawn");
  assert.equal(spawns.length, 1);
  assert.deepEqual(spawns[0]?.[0], {
    projectId: "proj_1",
    environment: { type: "reuse", environmentId: "env_1" },
    parentThreadId: parent.id,
    title: launch.title,
    prompt: launch.prompt,
    providerId: "codex",
    model: "gpt",
    // An unset mode inherits the parent's mode, never the project default.
    permissionMode: "auto",
    pluginMetadata: { conductorAgentId: launch.agentId },
    origin: "plugin",
    originPluginId: "conductor",
  });
  assert.equal(await ids.threadOf(launch.agentId), "thr_child_1");
  assert.equal(await ids.agentOf("thr_child_1"), launch.agentId);
});

void test("createAgent rejects a launch bb refuses", async () => {
  const { harness, host, ids } = fixture();
  harness.sdk.stub("threads.spawn", async () => {
    throw Object.assign(new Error("startedOnBehalfOf requires an originKind"), {
      status: 400,
    });
  });

  await assert.rejects(
    host.createAgent(launch),
    (error: unknown) =>
      error instanceof LaunchRejectedError &&
      error.message.includes("startedOnBehalfOf requires an originKind"),
  );
  assert.equal(await ids.bound(launch.agentId), false);
});

void test("createAgent leaves an unconfirmed spawn uncertain", async () => {
  const { harness, host } = fixture();
  harness.sdk.stub("threads.spawn", async () => {
    throw Object.assign(new Error("Gateway timeout"), { status: 504 });
  });

  await assert.rejects(
    host.createAgent(launch),
    (error: unknown) =>
      error instanceof Error && !(error instanceof LaunchRejectedError),
  );
});

void test("agent maps a task thread back to its Conductor identity", async () => {
  const { host } = fixture();
  await host.createAgent(launch);

  const snapshot = await host.agent(launch.agentId);

  assert.equal(snapshot?.id, launch.agentId);
  assert.equal(snapshot?.parentAgentId, parent.id);
  assert.equal(snapshot?.concertId, "env_1");
  assert.equal(snapshot?.status, "initializing");
  assert.equal(snapshot?.modeId, "auto");
  assert.equal(snapshot?.cwd, "/work/repo");
  assert.equal(await host.agent("thr_missing"), null);
});

void test("createAgent rebinds a spawned thread whose binding was lost", async () => {
  const { harness, host, ids } = fixture();
  harness.sdk.stub("threads.list", async () => [
    makeThreadResponse({ id: "thr_orphan", parentThreadId: parent.id }),
  ]);
  harness.sdk.stub("threads.experimental_listPluginMetadata", async () => ({
    threads: [
      {
        threadId: "thr_orphan",
        metadata: { conductorAgentId: launch.agentId },
      },
    ],
  }));

  await host.createAgent(launch);

  assert.equal(harness.inspection.sdk.callsTo("threads.spawn").length, 0);
  assert.equal(await ids.threadOf(launch.agentId), "thr_orphan");
});

void test("send delivers each message ID once", async () => {
  const { harness, host } = fixture();

  await host.send(parent.id, "Continue.", "message-1");
  await host.send(parent.id, "Continue.", "message-1");

  assert.equal(harness.inspection.sdk.callsTo("threads.send").length, 1);
});

void test("only an environment on the server machine has a directory", async () => {
  const { host } = fixture();

  assert.equal((await host.concert("env_1"))?.directory, "/work/repo");
  assert.equal((await host.concert("env_remote"))?.directory, null);
});

void test("providers and models use bb provider IDs", async () => {
  const { host } = fixture();

  assert.deepEqual(await host.providers(), [
    { provider: "codex", available: true },
  ]);
  assert.deepEqual(await host.models("codex", "/work/repo"), ["gpt"]);
});

void test("a task thread never gets a broader mode than its parent", async () => {
  const { harness, host } = fixture();

  await host.createAgent({
    ...launch,
    config: { provider: "codex/gpt", modeId: "full" },
  });

  const [args] = harness.inspection.sdk.callsTo("threads.spawn")[0] ?? [];
  assert.equal((args as { permissionMode: string }).permissionMode, "auto");
});

/** Stubs a parent permission mode and a provider list with reported modes. */
function withModes(
  harness: ReturnType<typeof fixture>["harness"],
  parentMode: string,
  providers: { id: string; permissionModes: string[] }[],
) {
  harness.sdk.stub("threads.defaultExecutionOptions", async () => ({
    model: "opus",
    permissionMode: parentMode,
    reasoningLevel: "high",
    serviceTier: "default",
    source: "client/thread/start",
  }));
  harness.sdk.stub("providers.list", async () =>
    providers.map(({ id, permissionModes }) => ({
      id,
      available: true,
      capabilities: { permissionModes },
    })),
  );
}

function spawnedMode(harness: ReturnType<typeof fixture>["harness"]) {
  const [args] = harness.inspection.sdk.callsTo("threads.spawn")[0] ?? [];
  return (args as { permissionMode: string }).permissionMode;
}

void test("a full-only provider runs under a full Conductor thread", async () => {
  const { harness, host } = fixture();
  withModes(harness, "full", [{ id: "pi", permissionModes: ["full"] }]);

  await host.createAgent({ ...launch, config: { provider: "pi/model" } });

  assert.equal(spawnedMode(harness), "full");
});

void test("a provider gets its next broader mode within the ceiling", async () => {
  const { harness, host } = fixture();
  withModes(harness, "full", [
    { id: "acp-opencode", permissionModes: ["accept-edits", "full"] },
  ]);

  await host.createAgent({
    ...launch,
    config: { provider: "acp-opencode/model", modeId: "auto" },
  });

  assert.equal(spawnedMode(harness), "full");
});

void test("modes reports a provider's bb permission modes", async () => {
  const { harness, host } = fixture();
  withModes(harness, "auto", [{ id: "pi", permissionModes: ["full"] }]);

  assert.deepEqual(await host.modes("pi", "/work/repo"), ["full"]);
});

void test("a task under a full Conductor thread runs full despite a narrower profile", async () => {
  const { harness, host } = fixture();
  withModes(harness, "full", [
    { id: "codex", permissionModes: ["accept-edits", "auto", "full"] },
  ]);
  const profile: ConductorProfile = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Reviewer",
    notes: "",
    provider: "codex",
    model: "gpt",
    modeId: "auto-review",
    routing: null,
    instructions: "",
  };
  await workerRuntime(translatedHost(host, bbVocabulary), () => [
    profile,
  ]).launch({
    agentId: launch.agentId,
    concertId: launch.concertId,
    parentAgentId: launch.parentAgentId,
    title: launch.title,
    prompt: launch.prompt,
    profile: "Reviewer",
  });

  assert.equal(spawnedMode(harness), "full");
});

void test("a provider whose modes exceed the ceiling is rejected", async () => {
  const { harness, host, ids } = fixture();
  withModes(harness, "auto", [{ id: "pi", permissionModes: ["full"] }]);

  await assert.rejects(
    host.createAgent({ ...launch, config: { provider: "pi/model" } }),
    (error: unknown) =>
      error instanceof LaunchRejectedError &&
      error.message.includes("Provider pi runs only the full permission mode"),
  );
  assert.equal(harness.inspection.sdk.callsTo("threads.spawn").length, 0);
  assert.equal(await ids.bound(launch.agentId), false);
});

void test("store profiles with Paseo IDs launch bb threads", async () => {
  const { harness, host } = fixture();
  const translated = translatedHost(host, bbVocabulary);

  await translated.createAgent({
    ...launch,
    config: { provider: "claude/claude-opus-5-5", modeId: "auto-review" },
  });

  const [args] = harness.inspection.sdk.callsTo("threads.spawn")[0] ?? [];
  assert.equal((args as { providerId: string }).providerId, "claude-code");
  assert.equal((args as { model: string }).model, "claude-opus-5-5");
  assert.equal((args as { permissionMode: string }).permissionMode, "auto");
  // The core compares modes in the store's vocabulary.
  assert.equal((await translated.agent(parent.id))?.modeId, "auto");
});
