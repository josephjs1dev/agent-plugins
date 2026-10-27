import assert from "node:assert/strict";
import { test } from "node:test";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { AgentIds } from "../server/engine/bb/agent-ids";
import { observeThreads } from "../server/entrypoints/events";

type Handler = (event: { thread: { id: string } }) => Promise<void>;

void test("a thread event marks unreported work, then reconciles at once", async () => {
  const handlers = new Map<string, Handler>();
  const bb = {
    events: {
      on(name: string, handler: Handler) {
        handlers.set(name, handler);
        return () => {};
      },
    },
  } as unknown as Pick<BbPluginApi, "events">;
  const interrupted: string[] = [];
  let reconciled = 0;
  const ids = {
    agentOf: (threadId: string) => Promise.resolve(`agent:${threadId}`),
  } as unknown as AgentIds;
  observeThreads(
    bb,
    {
      execution: {
        interrupt: (agentId: string | null) => {
          interrupted.push(agentId ?? "");
          return Promise.reject(new Error("store unavailable"));
        },
      } as never,
      reconcile: () => {
        reconciled++;
        return Promise.resolve();
      },
    },
    ids,
    Promise.resolve(),
  );
  assert.deepEqual([...handlers.keys()].sort(), [
    "thread.archived",
    "thread.deleted",
    "thread.failed",
    "thread.idle",
  ]);
  // A failed interrupt still reconciles, so a stopped task agent is observed.
  const idle = handlers.get("thread.idle");
  assert.ok(idle);
  await assert.rejects(idle({ thread: { id: "t1" } }));
  assert.deepEqual(interrupted, ["agent:t1"]);
  assert.equal(reconciled, 1);
});
