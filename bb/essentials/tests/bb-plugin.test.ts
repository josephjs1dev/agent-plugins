import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { writeSavedHistory } from "essentials/history-files";
import type { HistoryRow } from "essentials/history";
import type { History } from "essentials/history";
import type {
  ReminderSettings,
  ReminderState,
} from "../server/entrypoints/contract";
import plugin from "../server";

const ENV_KEYS = [
  "ESSENTIALS_HOME",
  "CODEX_HOME",
  "XDG_DATA_HOME",
  "OPENCODE_USAGE_DB",
  "CLAUDE_CONFIG_DIR",
  "CLAUDE_USAGE_PROJECTS_DIR",
  "PI_CODING_AGENT_DIR",
  "PI_USAGE_SESSION_DIR",
] as const;

let home: string;
const previous = new Map<string, string | undefined>();

beforeEach(async () => {
  home = await realpath(await mkdtemp(join(tmpdir(), "bb-essentials-")));
  // Every collector reads only the temporary directory.
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    process.env[key] = join(home, key.toLowerCase());
  }
});

afterEach(async () => {
  for (const key of ENV_KEYS) {
    const value = previous.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  await rm(home, { recursive: true, force: true });
});

const WINDOW = 1_000_000;

function context(usedTokens: number, sessionId = "sess-main") {
  return {
    usage: {
      usedTokens,
      modelContextWindow: WINDOW,
      estimated: false,
      snapshot: {
        autoCompactAtTokens: null,
        capturedAt: new Date().toISOString(),
        categories: [],
        contextWindowTokens: WINDOW,
        estimated: false,
        model: "sonnet",
        providerSessionId: sessionId,
        providerTurnId: null,
        usedTokens,
      },
    },
  };
}

const main = makeThreadResponse({
  id: "thr_main",
  environmentId: "env_a",
  providerId: "claude-code",
});
const child = makeThreadResponse({
  id: "thr_child",
  environmentId: "env_a",
  providerId: "claude-code",
  parentThreadId: "thr_main",
});

function loaded(
  contexts: Record<string, ReturnType<typeof context>>,
  settings: Record<string, string | boolean> = {},
) {
  const host = createFakePluginHost({
    pluginId: "essentials",
    settings,
    sdk: {
      threads: {
        context: async ({ threadId }: { threadId: string }) =>
          contexts[threadId] ?? { usage: null },
        get: async ({ threadId }: { threadId: string }) =>
          threadId === child.id ? child : main,
        list: async () => [],
        compact: async () => ({ ok: true as const }),
      },
    },
  });
  plugin(host.bb);
  return host;
}

/** Thread-event handlers run detached; wait until `ready` holds. */
async function eventually(ready: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await ready()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("Condition not reached");
}

async function idle(host: ReturnType<typeof loaded>, thread = main) {
  await host.harness.behavior.emitThreadEvent("thread.idle", {
    thread,
    lastAssistantText: null,
  });
}

function reminderState(host: ReturnType<typeof loaded>, threadId: string) {
  return host.harness.behavior.callRpc("context_reminder.state", {
    threadId,
  }) as Promise<ReminderState>;
}

void test("a turn above Warn at keeps a reminder until snoozed", async () => {
  const host = loaded({ thr_main: context(0.3 * WINDOW) });

  await idle(host);
  await eventually(
    async () => (await reminderState(host, main.id)).notice !== null,
  );

  const state = await reminderState(host, main.id);
  assert.equal(state.notice?.tier, "warn");
  assert.deepEqual(state.reading, {
    usedTokens: 0.3 * WINDOW,
    maxTokens: WINDOW,
  });
  assert.ok(
    host.harness.inspection.realtimeSignals.some(
      (signal) => signal.channel === "context-reminder.changed",
    ),
  );

  const snoozed = (await host.harness.behavior.callRpc(
    "context_reminder.snooze",
    {
      threadId: main.id,
      minutes: 30,
    },
  )) as ReminderState;
  assert.equal(snoozed.notice, null);
  assert.ok(snoozed.snoozedUntil);
  await host.harness.lifecycle.dispose();
});

void test("Dismiss hides the card until Remind every turns pass", async () => {
  const host = loaded(
    { thr_main: context(0.3 * WINDOW) },
    { notifyEvery: "3" },
  );
  await idle(host);
  await eventually(
    async () => (await reminderState(host, main.id)).notice !== null,
  );

  const dismissed = (await host.harness.behavior.callRpc(
    "context_reminder.dismiss",
    { threadId: main.id },
  )) as ReminderState;
  assert.equal(dismissed.notice, null);
  assert.equal(dismissed.nextCardInTurns, 3);

  for (const left of [2, 1]) {
    await idle(host);
    await eventually(
      async () => (await reminderState(host, main.id)).nextCardInTurns === left,
    );
  }
  await idle(host);
  await eventually(
    async () => (await reminderState(host, main.id)).notice !== null,
  );
  assert.equal((await reminderState(host, main.id)).nextCardInTurns, null);
  await host.harness.lifecycle.dispose();
});

void test("Compact now compacts the thread and clears the reminder", async () => {
  const host = loaded({ thr_main: context(0.6 * WINDOW) });
  await idle(host);
  await eventually(
    async () => (await reminderState(host, main.id)).notice !== null,
  );

  const state = (await host.harness.behavior.callRpc(
    "context_reminder.compact",
    {
      threadId: main.id,
    },
  )) as ReminderState;

  assert.equal(state.notice, null);
  assert.deepEqual(host.harness.inspection.sdk.callsTo("threads.compact")[0], [
    { threadId: main.id },
  ]);
  await host.harness.lifecycle.dispose();
});

void test("settings thresholds apply and child threads get no reminder", async () => {
  const host = loaded(
    {
      thr_main: context(0.3 * WINDOW),
      thr_child: context(0.9 * WINDOW, "sess-child"),
    },
    { warnPercent: "50" },
  );
  await idle(host);
  await idle(host, child);
  await eventually(
    async () => (await reminderState(host, main.id)).reading !== null,
  );

  assert.equal((await reminderState(host, main.id)).notice, null);
  assert.equal((await reminderState(host, child.id)).notice, null);
  assert.equal((await reminderState(host, main.id)).config.warnPercent, 50);
  await host.harness.lifecycle.dispose();
});

function row(sessionId: string): HistoryRow {
  const lastAt = new Date();
  return {
    provider: "claude",
    harness: "claude",
    sessionId,
    cwd: "/shared/checkout",
    model: null,
    day: lastAt.toISOString().slice(0, 10),
    lastAt: lastAt.toISOString(),
    totals: { input: 100, cached: 0, output: 10, reasoning: 0, cost: null },
  };
}

void test("usage history is host-wide, with empty workspace totals", async () => {
  const scannedAt = new Date().toISOString();
  const collector = { updatedThrough: scannedAt, incomplete: false };
  await writeSavedHistory(join(home, "essentials_home", "provider-usage"), {
    version: 3,
    scannedAt,
    collectors: {
      codex: collector,
      pi: collector,
      opencode: collector,
      claude: collector,
    },
    rows: [row("sess-main"), row("sess-child"), row("terminal")],
  });
  const host = loaded({});

  const history = (await host.harness.behavior.callRpc("usage.history", {
    provider: "claude",
    days: 7,
    sessionOffset: 0,
  })) as History;

  assert.equal(history.sessionCount, 3);
  assert.equal(history.totals.input, 300);
  assert.equal(history.workspaceSessionCount, 0);
  assert.equal(history.workspaceTotals.input, 0);
  await host.harness.lifecycle.dispose();
});

void test("the Context Reminder page reads and saves typed settings", async () => {
  const host = loaded({}, { warnPercent: "50" });

  const before = (await host.harness.behavior.callRpc(
    "context_reminder.settings",
    {},
  )) as ReminderSettings;
  assert.equal(before.warnPercent, 50);

  const after = (await host.harness.behavior.callRpc(
    "context_reminder.configure",
    { askPercent: 70, character: "boy", enabled: false },
  )) as ReminderSettings;

  assert.equal(after.warnPercent, 50);
  assert.equal(after.askPercent, 70);
  assert.equal(after.character, "boy");
  assert.equal(after.enabled, false);
  assert.equal((await reminderState(host, main.id)).config.askPercent, 70);
  await host.harness.lifecycle.dispose();
});

void test("the Context Reminder page rejects a value bb cannot store", async () => {
  const host = loaded({});

  await assert.rejects(
    host.harness.behavior.callRpc("context_reminder.configure", {
      warnPercent: 33,
    }),
    /could not save/,
  );
  await host.harness.lifecycle.dispose();
});
