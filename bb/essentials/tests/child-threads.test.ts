import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import {
  describePlan,
  describeResult,
  planCleanup,
  type ChildThread,
  type CleanupPlan,
  type CleanupResult,
} from "../shared/child-threads";
import plugin from "../server";

function child(
  id: string,
  parentId: string,
  overrides: Partial<ChildThread> = {},
): ChildThread {
  return {
    id,
    parentId,
    title: id,
    status: "idle",
    archived: false,
    hidden: false,
    backgroundWork: 0,
    queuedWork: false,
    pendingInteraction: false,
    ...overrides,
  };
}

/**
 * root ── a (idle)
 *      ├─ b (active)
 *      ├─ c (idle) ── d (active)
 *      ├─ e (idle, archived)
 *      ├─ f (idle, hidden)
 *      └─ g (idle) ── h (idle)
 */
const tree = [
  child("a", "root"),
  child("b", "root", { status: "active" }),
  child("c", "root"),
  child("e", "root", { archived: true }),
  child("f", "root", { hidden: true }),
  child("g", "root"),
  child("d", "c", { status: "active" }),
  child("h", "g"),
];

const ids = (plan: CleanupPlan) => plan.targets.map((target) => target.id);

void test("archive targets idle unarchived threads, deepest first", () => {
  const plan = planCleanup(tree, "archive");
  assert.deepEqual(ids(plan), ["h", "g", "a"]);
  assert.equal(plan.busy, 2);
  assert.equal(plan.blocked, 1);
  assert.equal(
    describePlan(plan),
    "3 idle child threads to archive. 2 busy child threads stay. 1 idle child thread above busy work stays.",
  );
});

void test("delete also targets archived threads", () => {
  assert.deepEqual(ids(planCleanup(tree, "delete")), ["h", "g", "e", "a"]);
});

void test("background work, queued messages, and questions count as busy", () => {
  for (const overrides of [
    { backgroundWork: 1 },
    { queuedWork: true },
    { pendingInteraction: true },
    { status: "error" },
  ]) {
    const plan = planCleanup(
      [child("p", "root"), child("q", "p", overrides)],
      "delete",
    );
    assert.deepEqual(ids(plan), [], JSON.stringify(overrides));
    assert.equal(plan.blocked, 1);
  }
});

void test("a busy hidden thread keeps its ancestors", () => {
  const plan = planCleanup(
    [child("p", "root"), child("q", "p", { hidden: true, status: "active" })],
    "archive",
  );
  assert.deepEqual(ids(plan), []);
  assert.equal(plan.busy, 0);
  assert.equal(plan.blocked, 1);
});

interface Node {
  id: string;
  parentThreadId: string;
  status?: "idle" | "active";
  archived?: boolean;
}

/** A plugin host whose bb lists `nodes` by parent and records each change. */
function loaded(nodes: Node[], failing: ReadonlySet<string> = new Set()) {
  const calls: string[] = [];
  const change = (verb: string, threadId: string) => {
    calls.push(`${verb} ${threadId}`);
    if (failing.has(threadId)) {
      throw new Error(`cannot ${verb} ${threadId}`);
    }
  };
  const host = createFakePluginHost({
    pluginId: "essentials",
    sdk: {
      threads: {
        list: async ({ parentThreadId }: { parentThreadId?: string } = {}) =>
          nodes
            .filter((node) => node.parentThreadId === parentThreadId)
            .map((node) => ({
              ...makeThreadResponse({
                id: node.id,
                parentThreadId: node.parentThreadId,
                status: node.status ?? "idle",
                title: `Thread ${node.id}`,
                archivedAt: node.archived ? 1 : null,
              }),
              activity: {
                activeBackgroundAgentCount: 0,
                activeBackgroundCommandCount: 0,
                activeGoalCount: 0,
                activePlanModeCount: 0,
                activeWorkflowCount: 0,
              },
              queuedWork: "none" as const,
              hasPendingInteraction: false,
            })),
        archive: async ({ threadId }: { threadId: string }) => {
          change("archive", threadId);
          return { ok: true as const, archivedThreadIds: [threadId] };
        },
        delete: async ({ threadId }: { threadId: string }) => {
          change("delete", threadId);
          return { ok: true as const };
        },
      },
    },
  });
  plugin(host.bb);
  return { host, calls };
}

const nodes: Node[] = [
  { id: "a", parentThreadId: "root" },
  { id: "b", parentThreadId: "root", status: "active" },
  { id: "c", parentThreadId: "root", archived: true },
  { id: "d", parentThreadId: "a" },
];

void test("plan reads the whole tree through bb", async () => {
  const { host } = loaded(nodes);
  const plan = (await host.harness.behavior.callRpc("child_threads.plan", {
    threadId: "root",
    action: "delete",
  })) as CleanupPlan;
  assert.deepEqual(ids(plan), ["d", "c", "a"]);
  assert.equal(plan.targets[0]?.title, "Thread d");
  assert.equal(plan.busy, 1);
  await host.harness.lifecycle.dispose();
});

void test("run deletes confirmed threads that are still idle", async () => {
  const { host, calls } = loaded(nodes);
  // "b" is busy now, so it stays even though the caller confirmed it.
  const result = (await host.harness.behavior.callRpc("child_threads.run", {
    threadId: "root",
    action: "delete",
    threadIds: ["d", "a", "b"],
  })) as CleanupResult;
  assert.deepEqual(calls, ["delete d", "delete a"]);
  assert.deepEqual(host.harness.inspection.sdk.callsTo("threads.delete")[0], [
    { threadId: "d", childThreadsConfirmed: true },
  ]);
  assert.equal(result.skipped, 1);
  assert.equal(
    describeResult(result),
    "Deleted 2 child threads. 1 child thread changed since the check and stays. 1 busy child thread stays.",
  );
  await host.harness.lifecycle.dispose();
});

void test("a failed child keeps every thread above it", async () => {
  const { host, calls } = loaded(nodes, new Set(["d"]));
  const result = (await host.harness.behavior.callRpc("child_threads.run", {
    threadId: "root",
    action: "archive",
    threadIds: ["d", "a"],
  })) as CleanupResult;
  assert.deepEqual(calls, ["archive d"]);
  assert.deepEqual(
    result.failed.map(({ id, message }) => [id, message]),
    [
      ["d", "cannot archive d"],
      ["a", "A child thread below it failed."],
    ],
  );
  await host.harness.lifecycle.dispose();
});

void test("run rejects an empty confirmation", async () => {
  const { host } = loaded(nodes);
  await assert.rejects(
    host.harness.behavior.callRpc("child_threads.run", {
      threadId: "root",
      action: "delete",
      threadIds: [],
    }),
  );
  await host.harness.lifecycle.dispose();
});
