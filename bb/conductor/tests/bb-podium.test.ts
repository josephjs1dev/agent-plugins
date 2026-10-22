import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import type { AgentsSnapshot } from "conductor/agents/models";
import type { ProviderCatalog } from "conductor/symphonies/profiles-contracts";
import {
  type BbInteraction,
  toPermissionRequest,
  toResolution,
} from "../server/engine/bb/interactions";
import plugin from "../server";

let home: string;
let previousHome: string | undefined;

beforeEach(async () => {
  home = await realpath(await mkdtemp(join(tmpdir(), "bb-podium-")));
  previousHome = process.env.CONDUCTOR_HOME;
  process.env.CONDUCTOR_HOME = home;
});

afterEach(async () => {
  if (previousHome === undefined) {
    delete process.env.CONDUCTOR_HOME;
  } else {
    process.env.CONDUCTOR_HOME = previousHome;
  }
  await rm(home, { recursive: true, force: true });
});

const base = {
  createdAt: 1,
  expiresAt: null,
  providerId: "codex",
  providerRequestId: "req",
  providerThreadId: "pthr",
  resolution: null,
  resolvedAt: null,
  status: "pending",
  statusReason: null,
  threadId: "thr_task",
  turnId: "turn_1",
};

const approval = {
  ...base,
  id: "int_approval",
  payload: {
    kind: "approval",
    availableDecisions: ["allow_once", "allow_for_session", "deny"],
    reason: "Runs the test suite.",
    subject: {
      kind: "command",
      command: "npm test",
      cwd: "/work/repo",
      itemId: "item_1",
      actions: [],
      sessionGrant: null,
    },
  },
} as unknown as BbInteraction;

const question = {
  ...base,
  id: "int_question",
  payload: {
    kind: "user_question",
    questions: [
      {
        id: "q_scope",
        prompt: "Which packages?",
        shortLabel: "Scope",
        multiSelect: true,
        allowFreeText: true,
        options: [
          { label: "Core", value: "core" },
          { label: "Adapter", value: "adapter" },
        ],
      },
    ],
  },
} as unknown as BbInteraction;

void test("an approval offers bb's decisions as actions", () => {
  const request = toPermissionRequest(approval, "codex");

  assert.equal(request.kind, "tool");
  assert.equal(request.title, "npm test");
  assert.equal(request.description, "Runs the test suite.");
  assert.deepEqual(
    request.actions?.map((action) => [action.id, action.behavior]),
    [
      ["allow_once", "allow"],
      ["allow_for_session", "allow"],
      ["deny", "deny"],
    ],
  );
  assert.deepEqual(
    toResolution(approval, {
      behavior: "allow",
      selectedActionId: "allow_for_session",
    }),
    { decision: "allow_for_session", grantedPermissions: null },
  );
  assert.deepEqual(
    toResolution(approval, { behavior: "deny", selectedActionId: "deny" }),
    { decision: "deny" },
  );
});

void test("a question answer maps option labels back to bb values", () => {
  const request = toPermissionRequest(question, "codex");
  assert.equal(request.kind, "question");

  assert.deepEqual(
    toResolution(question, {
      behavior: "allow",
      updatedInput: { answers: { Scope: "Core, Adapter, docs too" } },
    }),
    {
      kind: "user_answer",
      answers: {
        q_scope: { selected: ["core", "adapter"], freeText: "docs too" },
      },
    },
  );
});

function loaded() {
  const task = makeThreadResponse({
    id: "thr_task",
    projectId: "proj_1",
    environmentId: "env_1",
    providerId: "codex",
    status: "active",
    title: "Implement the parser",
  });
  const host = createFakePluginHost({
    pluginId: "conductor",
    sdk: {
      threads: {
        list: async () => [task],
        get: async () => task,
        defaultExecutionOptions: async () => ({
          model: "gpt",
          permissionMode: "auto",
          reasoningLevel: "high",
          serviceTier: "default",
          source: "client/thread/start",
        }),
        interactions: {
          list: async () => [approval],
          get: async () => approval,
          resolve: async () => approval,
        },
      },
      environments: {
        get: async () => ({ id: "env_1", path: "/work/repo" }),
        list: async () => [
          {
            id: "env_1",
            name: "main",
            branchName: null,
            path: "/work/repo",
            projectId: "proj_1",
          },
        ],
      },
      projects: { list: async () => [{ id: "proj_1", name: "agent-plugins" }] },
      providers: {
        list: async () => [
          { id: "claude-code", displayName: "Claude Code", available: true },
        ],
        models: async () => ({
          modelLoadError: null,
          models: [
            {
              id: "claude-code:opus",
              model: "opus",
              displayName: "Opus",
              description: "",
              isDefault: true,
              defaultReasoningEffort: "high",
              supportedReasoningEfforts: [
                { reasoningEffort: "high", description: "" },
              ],
            },
          ],
        }),
      },
    },
  });
  plugin(host.bb);
  return host;
}

void test("agents.get lists a pending approval in its project", async () => {
  const { harness } = loaded();

  const result = (await harness.behavior.callRpc("agents.get", {
    knownAgentIds: [],
  })) as AgentsSnapshot;

  const item = result.items.find((entry) => entry.requestId === approval.id);
  assert.equal(item?.bucket, "waiting");
  assert.equal(item?.projectName, "agent-plugins");
  assert.equal(item?.concertName, "main");
  assert.equal(item?.title, "npm test");
  assert.equal(item?.form?.kind, "actions");
  await harness.lifecycle.dispose();
});

void test("agents.answer resolves the bb interaction", async () => {
  const { harness } = loaded();
  const snapshot = (await harness.behavior.callRpc("agents.get", {
    knownAgentIds: [],
  })) as AgentsSnapshot;
  const item = snapshot.items.find((entry) => entry.requestId === approval.id);
  assert.ok(item);

  const result = await harness.behavior.callRpc("agents.answer", {
    key: item.key,
    agentId: item.agentId,
    requestId: approval.id,
    decision: { kind: "action", actionId: "allow_once" },
  });

  assert.deepEqual(result, { status: "answered" });
  const [args] =
    harness.inspection.sdk.callsTo("threads.interactions.resolve")[0] ?? [];
  assert.deepEqual(args, {
    threadId: "thr_task",
    interactionId: approval.id,
    resolution: { decision: "allow_once", grantedPermissions: null },
  });
  await harness.lifecycle.dispose();
});

void test("profiles.providers uses the profile store's IDs", async () => {
  const { harness } = loaded();

  const catalog = (await harness.behavior.callRpc(
    "profiles.providers",
    {},
  )) as ProviderCatalog;

  const [provider] = catalog.providers;
  assert.equal(provider?.id, "claude");
  assert.deepEqual(
    provider?.modes.map((mode) => [mode.id, mode.elevated]),
    [
      ["accept-edits", false],
      ["auto", false],
      ["full-access", true],
    ],
  );
  assert.equal(provider?.models[0]?.defaultThinkingOptionId, "high");
  await harness.lifecycle.dispose();
});

void test("a thread event signals the Podium to refetch", async () => {
  const { harness } = loaded();

  await harness.behavior.emitThreadEvent("thread.archived", {
    thread: makeThreadResponse({ id: "thr_task" }),
  });
  await new Promise((resolve) => setTimeout(resolve, 600));

  assert.deepEqual(
    harness.inspection.realtimeSignals.map((signal) => signal.channel),
    ["podium.changed"],
  );
  await harness.lifecycle.dispose();
});
