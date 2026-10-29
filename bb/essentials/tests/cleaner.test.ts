import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { defineRpcContract } from "@get-bb/plugin-sdk";
import type { CleanerStatus } from "essentials/cleaner/contracts";
import { cleanerStore } from "../server/engine/bb/cleaner-store";
import { cleaner, cleanerSettings } from "../server/entrypoints/cleaner";
import { essentialsContract } from "../server/entrypoints/contract";
import { hostContract } from "../server/entrypoints/host-contract";

const native = "01a185c9-3796-7ba2-b826-80754ac76cbb";
const second = "01a185c5-4e00-7d80-833d-237274248b46";
const NOW = 1_790_000_000_000;
const DAY = 86_400_000;

const cleanerContract = defineRpcContract({
  "cleaner.status": essentialsContract["cleaner.status"],
  "cleaner.preview": essentialsContract["cleaner.preview"],
  "cleaner.clean": essentialsContract["cleaner.clean"],
  "cleaner.set_days": essentialsContract["cleaner.set_days"],
});

type Row = ReturnType<typeof row>;

function row(id: string, extra: Record<string, unknown> = {}) {
  return {
    ...makeThreadResponse({
      id,
      providerId: "claude-code",
      updatedAt: NOW - 90 * DAY,
    }),
    environmentHostId: "host-a",
    activity: { activeBackgroundAgentCount: 0 },
    hasPendingInteraction: false,
    queuedWork: "none",
    ...extra,
  };
}

interface HostCall {
  method: string;
  hostId: string;
  input: unknown;
}

type Driver = (call: HostCall) => unknown;

const defaultDriver: Driver = ({ method }) => {
  if (method === "cleaner.observe_storage") {
    return { exists: true };
  }

  if (method === "cleaner.delete_codex_catalog") {
    return { removed: 1 };
  }

  return { state: "done", deleted: 1, message: null };
};

function identityEvents(ids: readonly string[], homes: (string | null)[] = []) {
  return ids.flatMap((id, index) => [
    {
      seq: index * 2 + 1,
      type: "thread/identity",
      data: { providerThreadId: id },
    },
    {
      seq: index * 2 + 2,
      type: "provider.env-resolved",
      data: {
        providerThreadId: id,
        entries: homes[index]
          ? [{ name: "CODEX_HOME", value: homes[index] }]
          : [],
      },
    },
  ]);
}

const fixtures: { dispose(): Promise<void> }[] = [];

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    await fixture.dispose();
  }
});

function setup(
  options: { sessions?: boolean; provider?: "claude-code" | "codex" } = {},
) {
  let clock = NOW;
  const rows: Row[] = [
    row("thr_a", { providerId: options.provider ?? "claude-code" }),
  ];
  const deleted: string[] = [];
  const stopped: string[] = [];
  const state = { driver: defaultDriver, events: identityEvents([native]) };
  const fake = createFakePluginHost({
    pluginId: "essentials",
    experimental_hostEntry: true,
    settings: { cleanerDeleteSessions: options.sessions ?? false },
    experimental_callHostRpc: (call) => state.driver(call as HostCall),
    sdk: {
      hosts: {
        get: async () => ({
          id: "host-a",
          status: "connected",
          threadStorageRootPath: "/bb/thread-storage",
        }),
      },
      threads: {
        list: async ({
          archived,
          offset,
        }: {
          archived?: boolean;
          offset?: number;
        }) =>
          offset
            ? []
            : rows.filter(
                (entry) =>
                  entry.deletedAt === null &&
                  (entry.archivedAt !== null) === archived,
              ),
        events: {
          list: async ({ afterSeq }: { afterSeq?: string }) =>
            state.events.filter((event) => event.seq > Number(afterSeq ?? 0)),
        },
        stop: async ({ threadId }: { threadId: string }) => {
          stopped.push(threadId);

          return { ok: true };
        },
        delete: async ({ threadId }: { threadId: string }) => {
          deleted.push(threadId);
          for (const entry of rows.filter(
            (candidate) =>
              candidate.id === threadId ||
              candidate.parentThreadId === threadId,
          )) {
            entry.deletedAt = clock;
            await fake.harness.behavior.emitThreadEvent("thread.deleted", {
              thread: entry,
            });
          }

          return { ok: true };
        },
      },
    } as never,
  });
  const instance = cleaner({
    sdk: () => fake.bb.sdk,
    host: fake.bb.hosts.experimental_client({ contract: hostContract }),
    settings: fake.bb.settings.define(cleanerSettings),
    storage: fake.bb.storage,
    realtime: fake.bb.realtime,
    log: fake.bb.log,
    now: () => clock,
  });
  fake.bb.rpc.register(cleanerContract, instance.handlers);
  instance.observe(fake.bb);
  for (const providerId of instance.providers) {
    fake.bb.providers.experimental_contributeEnv(
      providerId,
      async (context) => {
        await instance.trackProviderSession(providerId, context);

        return [];
      },
    );
  }

  fake.bb.background.service("cleaner", instance.service);
  fixtures.push({
    dispose: async () => {
      instance.close();
      await fake.harness.lifecycle.dispose();
    },
  });
  const rpc = fake.harness.behavior;
  const hostCalls = (method?: string) =>
    fake.harness.experimental_hostRpcCalls.filter(
      (call) => method === undefined || call.method === method,
    );

  return {
    fake,
    rows,
    deleted,
    stopped,
    state,
    hostCalls,
    advance: (ms: number) => {
      clock += ms;
    },
    preview: () =>
      rpc.callRpc("cleaner.preview", {}) as Promise<{
        token: string;
        candidates: { id: string }[];
      }>,
    clean: (token: string, threadIds = ["thr_a"]) =>
      rpc.callRpc("cleaner.clean", { token, threadIds }) as Promise<{
        deleted: string[];
        skipped: { reason: string }[];
      }>,
    status: () => rpc.callRpc("cleaner.status", {}) as Promise<CleanerStatus>,
    /** Runs one background pass until `ready` holds, then stops it. */
    async runUntil(ready: () => Promise<boolean>) {
      const service = rpc.runService("cleaner");
      try {
        await eventually(ready);
      } finally {
        service.controller.abort();
        await service.done;
      }
    },
  };
}

async function eventually(ready: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await ready()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  assert.fail("Condition not reached");
}

void test("a scan deletes nothing, and one review deletes once", async () => {
  const f = setup();
  const review = await f.preview();
  assert.deepEqual(
    review.candidates.map((entry) => entry.id),
    ["thr_a"],
  );
  assert.deepEqual(f.deleted, []);
  assert.deepEqual(f.hostCalls(), []);
  await assert.rejects(f.clean("invented"), /expired/);
  assert.deepEqual((await f.clean(review.token)).deleted, ["thr_a"]);
  assert.deepEqual(f.stopped, ["thr_a"]);
  assert.equal((await f.status()).pending, 0);
  await assert.rejects(f.clean(review.token), /expired/);
  // Provider sessions are off by default: no host call at all.
  assert.deepEqual(f.hostCalls(), []);
});

void test("a change after review skips the thread", async () => {
  const changes: Record<string, (f: ReturnType<typeof setup>) => void> = {
    pinned: (f) => {
      f.rows[0]!.pinnedAt = NOW;
    },
    updated: (f) => {
      f.rows[0]!.updatedAt = NOW;
    },
    "new child": (f) => {
      f.rows.push(row("thr_new", { parentThreadId: "thr_a" }));
    },
  };
  for (const [name, change] of Object.entries(changes)) {
    const f = setup();
    const review = await f.preview();
    change(f);
    const result = await f.clean(review.token);
    assert.deepEqual(result.deleted, [], name);
    assert.match(result.skipped[0]!.reason, /changed/, name);
    assert.deepEqual(f.deleted, [], name);
  }
});

void test("a pinned archived ancestor hides its descendants", async () => {
  const f = setup();
  f.rows.push(row("thr_parent", { pinnedAt: NOW, archivedAt: NOW }));
  f.rows[0]!.parentThreadId = "thr_parent";
  assert.deepEqual((await f.preview()).candidates, []);
});

void test("an ancestor pinned after review protects the thread", async () => {
  for (const link of ["parentThreadId", "lifecycleOwnerThreadId"] as const) {
    const f = setup();
    f.rows.push(row("thr_parent", { updatedAt: NOW }));
    f.rows[0]![link] = "thr_parent";
    const review = await f.preview();
    assert.deepEqual(
      review.candidates.map((entry) => entry.id),
      ["thr_a"],
    );
    f.rows[1]!.pinnedAt = NOW;
    const result = await f.clean(review.token);
    assert.deepEqual(result.deleted, [], link);
    assert.deepEqual(f.stopped, [], link);
  }
});

void test("sessions recorded before deletion are deleted on the recorded host", async () => {
  const f = setup({ sessions: true });
  await f.clean((await f.preview()).token);
  assert.equal((await f.status()).pending, 1);
  assert.ok(
    f.hostCalls().every((call) => call.method === "cleaner.observe_storage"),
  );
  await f.runUntil(async () => (await f.status()).pending === 0);
  const calls = f.hostCalls("cleaner.delete_sessions");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.hostId, "host-a");
  assert.partialDeepStrictEqual(calls[0]!.input, {
    target: {
      threadId: "thr_a",
      storagePath: "/bb/thread-storage/thr_a",
      storageObserved: true,
      sessions: [{ id: native, provider: "claude-code" }],
    },
  });
});

void test("a session that another live thread references stays", async () => {
  const f = setup({ sessions: true });
  f.rows.push(row("thr_shared", { pinnedAt: NOW }));
  await f.clean((await f.preview()).token);
  await f.runUntil(async () =>
    /another bb thread/.test((await f.status()).problems[0]?.message ?? ""),
  );
  assert.deepEqual(f.hostCalls("cleaner.delete_sessions"), []);
});

void test("a deletion before identity capture removes no provider data", async () => {
  const f = setup({ sessions: true });
  await f.fake.harness.behavior.emitThreadEvent("thread.deleted", {
    thread: { ...f.rows[0]!, deletedAt: NOW },
  });
  assert.match(
    (await f.status()).problems[0]!.message,
    /No native session identity/,
  );
  assert.deepEqual(f.hostCalls(), []);
});

void test("turning on session deletion after review needs a new review", async () => {
  const f = setup();
  const review = await f.preview();
  await f.fake.harness.behavior.setSettings({ cleanerDeleteSessions: true });
  const result = await f.clean(review.token);
  assert.deepEqual(result.deleted, []);
  assert.match(result.skipped[0]!.reason, /settings changed/);
});

void test("the age defaults to 7 days, accepts 1 to 30, and resets reviews", async () => {
  const f = setup();
  const call = f.fake.harness.behavior.callRpc;
  assert.equal((await f.status()).days, 7);
  const review = await f.preview();
  await assert.rejects(call("cleaner.set_days", { days: 0 }));
  await assert.rejects(call("cleaner.set_days", { days: 31 }));
  assert.equal(
    ((await call("cleaner.set_days", { days: 1 })) as CleanerStatus).days,
    1,
  );
  const result = await f.clean(review.token);
  assert.match(result.skipped[0]!.reason, /settings changed/);
  assert.equal(
    ((await call("cleaner.set_days", { days: 30 })) as CleanerStatus).days,
    30,
  );
});

void test("identity history is read in bb's 100-event pages", async () => {
  const f = setup({ sessions: true });
  const pages: number[] = [];
  f.fake.harness.sdk.stub(
    "threads.events.list",
    async ({ limit, afterSeq }: { limit?: string; afterSeq?: string }) => {
      assert.equal(limit, "100");
      const after = Number(afterSeq ?? 0);
      pages.push(after);

      return Array.from({ length: 202 }, (_, index) => ({
        seq: index + 1,
        type: index % 2 === 0 ? "thread/identity" : "provider.env-resolved",
        data: { providerThreadId: native, entries: [] },
      }))
        .filter((event) => event.seq > after)
        .slice(0, 100);
    },
  );
  await f.preview();
  assert.deepEqual(pages, [0, 100, 200]);
  assert.equal((await f.status()).scanError, null);
});

void test("a failed Codex sidebar cleanup retries without deleting the session again", async () => {
  const f = setup({ sessions: true, provider: "codex" });
  await f.clean((await f.preview()).token);
  f.state.driver = (call) => {
    if (call.method === "cleaner.delete_codex_catalog") {
      throw new Error("database is locked");
    }

    return defaultDriver(call);
  };
  await f.runUntil(async () =>
    /Desktop sidebar cleanup is pending.*locked/.test(
      (await f.status()).problems[0]?.message ?? "",
    ),
  );
  const stored = cleanerStore(f.fake.bb.storage).get("thr_a")!;
  assert.deepEqual(stored.completed, [`codex:${native}`]);
  assert.deepEqual(stored.catalogCompleted, []);
  assert.equal(stored.done, false);

  f.state.driver = defaultDriver;
  f.advance(30_001);
  await f.runUntil(async () => (await f.status()).pending === 0);
  assert.equal(f.hostCalls("cleaner.delete_sessions").length, 1);
  assert.equal(f.hostCalls("cleaner.delete_codex_catalog").length, 2);
  assert.ok(f.hostCalls().every((call) => call.hostId === "host-a"));
});

void test("a waiting or failed native deletion leaves the Codex sidebar alone", async () => {
  for (const outcome of ["waiting", "failed"]) {
    const f = setup({ sessions: true, provider: "codex" });
    await f.clean((await f.preview()).token);
    f.state.driver = (call) => {
      if (call.method === "cleaner.observe_storage") {
        return { exists: true };
      }

      if (outcome === "failed") {
        throw new Error("native delete rejected");
      }

      return { state: "waiting", deleted: 0, message: "Waiting for runtime" };
    };
    await f.runUntil(async () => (await f.status()).problems.length === 1);
    assert.deepEqual(f.hostCalls("cleaner.delete_codex_catalog"), [], outcome);
    assert.deepEqual(
      cleanerStore(f.fake.bb.storage).get("thr_a")!.completed,
      [],
      outcome,
    );
  }
});

void test("each Codex session keeps its own recorded home through both stages", async () => {
  const f = setup({ sessions: true, provider: "codex" });
  f.state.events = identityEvents([native, second], ["/custom/0", "/custom/1"]);
  await f.clean((await f.preview()).token);
  for (const id of [native, second]) {
    await f.runUntil(async () =>
      cleanerStore(f.fake.bb.storage)
        .get("thr_a")!
        .catalogCompleted.includes(`codex:${id}`),
    );
    f.advance(30_001);
  }

  assert.equal((await f.status()).pending, 0);
  const calls = f
    .hostCalls()
    .filter((call) => call.method !== "cleaner.observe_storage");
  assert.deepEqual(
    calls.map((call) => call.method),
    [
      "cleaner.delete_sessions",
      "cleaner.delete_codex_catalog",
      "cleaner.delete_sessions",
      "cleaner.delete_codex_catalog",
    ],
  );
  for (const [index, id] of [native, second].entries()) {
    const home = `/custom/${index}`;
    assert.partialDeepStrictEqual(calls[index * 2]!.input, {
      target: { sessions: [{ id, home }] },
    });
    assert.partialDeepStrictEqual(calls[index * 2 + 1]!.input, {
      session: { id, home },
    });
  }
});

void test("a wait in flight still records an identity after deletion", async () => {
  const f = setup({ sessions: true });
  const replies = new Map<string, (event: unknown) => void>();
  f.fake.harness.sdk.stub(
    "threads.events.wait",
    async ({
      type,
      afterSeq,
      signal,
    }: {
      type: string;
      afterSeq?: string;
      signal?: AbortSignal;
    }) => {
      if (Number(afterSeq) > 0) {
        throw new Error("404 thread not found");
      }

      return new Promise((resolve, reject) => {
        replies.set(type, resolve);
        signal?.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      });
    },
  );
  await f.fake.harness.behavior.resolveProviderEnv("claude-code", {
    threadId: "thr_a",
    projectId: "p",
    hostId: "host-a",
  });
  assert.equal(replies.size, 2);
  f.rows[0]!.deletedAt = NOW;
  await f.fake.harness.behavior.emitThreadEvent("thread.deleted", {
    thread: f.rows[0]!,
  });
  replies.get("thread/identity")!({
    seq: 1,
    type: "thread/identity",
    data: { providerThreadId: native },
  });
  // The next identity wait gets a 404. The pending environment wait survives it.
  await new Promise((resolve) => setTimeout(resolve, 0));
  replies.get("provider.env-resolved")!({
    seq: 2,
    type: "provider.env-resolved",
    data: { providerThreadId: native, entries: [] },
  });
  await f.runUntil(async () => (await f.status()).pending === 0);
  assert.equal(f.hostCalls("cleaner.delete_sessions").length, 1);
});
