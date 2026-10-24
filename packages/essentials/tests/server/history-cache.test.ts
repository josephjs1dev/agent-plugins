import { fakeCollectors, inDirectory } from "../history-fixtures";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createHistoryStore } from "../../history-store";
import { readSavedHistory, writeSavedHistory } from "../../history-files";
import type { HistoryRow } from "../../history";
import { usageCollectors } from "../../collectors/index";

const NOW = Date.parse("2026-10-03T12:00:00Z");
const DAY = 86_400_000;
function collectorStates(checkpoint: number, incomplete = false) {
  const updatedThrough = new Date(checkpoint).toISOString();

  return {
    codex: { updatedThrough, incomplete },
    pi: {
      updatedThrough,
      incomplete: false,
      revision: usageCollectors.pi.revision,
    },
    opencode: { updatedThrough, incomplete: false },
    claude: {
      updatedThrough,
      incomplete: false,
      revision: usageCollectors.claude.revision,
    },
  };
}

const iso = (time: number) => new Date(time).toISOString();
function row(input = 100): HistoryRow {
  const time = NOW - 2 * DAY;

  return {
    provider: "chatgpt",
    harness: "codex",
    sessionId: "one",
    cwd: "/workspace",
    model: "gpt-6.1-sol",
    day: iso(time).slice(0, 10),
    lastAt: iso(time),
    totals: { input, cached: 0, output: 20, reasoning: 0, cost: null },
  };
}

function deferred() {
  let release = () => {};

  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });

  return { promise, release };
}

async function seed(directory: string, checkpoint = NOW - 6 * 60_000) {
  await writeSavedHistory(directory, {
    version: 3,
    scannedAt: iso(NOW - 6 * 60_000),
    collectors: collectorStates(checkpoint),
    rows: [row()],
  });
}

test(
  "stale cache returns immediately and concurrent views share one background scan",
  { timeout: 3000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "paseo-cache-swr-"));
    const gate = deferred();
    let calls = 0;
    await seed(directory);
    const store = createHistoryStore(
      directory,
      fakeCollectors(async (harness) => {
        if (harness !== "codex") {
          return { rows: [], incomplete: false };
        }

        calls++;
        await gate.promise;

        return { rows: [row(150)], incomplete: false };
      }),
      () => NOW,
    );

    try {
      const cached = await store.read("chatgpt", inDirectory("/workspace"), 7);
      assert.equal(cached.workspaceTotals.input, 100);
      assert.equal(cached.refreshing, true);
      const other = await store.read(
        "chatgpt",
        inDirectory("/workspace"),
        30,
        0,
        "host",
      );
      assert.equal(other.totals.input, 100);
      assert.equal(calls, 1);
      gate.release();
      await store.refresh();
      const fresh = await store.read("chatgpt", inDirectory("/workspace"), 7);
      assert.equal(fresh.workspaceTotals.input, 150);
      assert.equal(fresh.refreshing, false);
      assert.equal(calls, 1);
      assert.equal(
        (await readSavedHistory(directory))?.collectors.codex?.updatedThrough,
        iso(NOW),
      );
    } finally {
      gate.release();
      await store.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test("fresh disk cache survives reload without rescanning or writing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "paseo-cache-reload-"));
  let calls = 0;
  await writeSavedHistory(directory, {
    version: 3,
    scannedAt: iso(NOW - 60_000),
    collectors: collectorStates(NOW - 60_000, true),
    rows: [row()],
  });
  const before = await readFile(join(directory, "history.json"));

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const store = createHistoryStore(
        directory,
        fakeCollectors(async () => {
          calls++;

          return { rows: [], incomplete: false };
        }),
        () => NOW,
      );

      try {
        const result = await store.read(
          "chatgpt",
          inDirectory("/workspace"),
          7,
        );
        assert.equal(result.workspaceTotals.input, 100);
        assert.equal(result.refreshing, false);
        assert.match(result.warning, /previously stored/);
      } finally {
        await store.close();
      }
    }

    assert.equal(calls, 0);
    assert.deepEqual(await readFile(join(directory, "history.json")), before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a changed collector revision rescans only that harness and re-prices its rows", async () => {
  const directory = await mkdtemp(join(tmpdir(), "paseo-cache-revision-"));
  const claudeRow: HistoryRow = {
    ...row(),
    provider: "claude",
    harness: "claude",
    model: "claude-haiku-5-5",
  };
  const collectors = collectorStates(NOW - 60_000);
  await writeSavedHistory(directory, {
    version: 3,
    scannedAt: iso(NOW - 60_000),
    collectors: {
      ...collectors,
      claude: { ...collectors.claude, revision: "old-rates" },
    },
    rows: [row(), claudeRow],
  });
  const windows = new Map<string, number | undefined>();
  const store = createHistoryStore(
    directory,
    fakeCollectors(async (harness, _since, _signal, modified) => {
      windows.set(harness, modified);

      return harness === "claude"
        ? {
            rows: [
              {
                ...claudeRow,
                totals: { ...claudeRow.totals, cost: 0.01 },
              },
            ],
            incomplete: false,
          }
        : { rows: [], incomplete: false };
    }),
    () => NOW,
  );

  try {
    await store.refresh();
    assert.equal(windows.get("claude"), NOW - 90 * DAY);
    assert.equal(windows.get("codex"), NOW - DAY);
    const saved = await readSavedHistory(directory);
    const claude = saved?.rows.filter((entry) => entry.harness === "claude");
    assert.deepEqual(
      claude?.map((entry) => entry.totals.cost),
      [0.01],
    );
    assert.equal(
      saved?.collectors.claude?.revision,
      usageCollectors.claude.revision,
    );
    assert.equal(
      saved?.rows.find((entry) => entry.harness === "codex")?.totals.input,
      100,
    );
  } finally {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("recent checkpoints scan one day of updates and stale checkpoints cover the outage", async () => {
  const directory = await mkdtemp(join(tmpdir(), "paseo-cache-window-"));
  await seed(directory);
  let clock = NOW;
  const windows: { since: number; modified: number | undefined }[] = [];
  const store = createHistoryStore(
    directory,
    fakeCollectors(async (harness, since, _signal, modified) => {
      if (harness === "codex") {
        windows.push({ since, modified });
      }

      return { rows: [], incomplete: false };
    }),
    () => clock,
  );

  try {
    await store.refresh();
    assert.deepEqual(windows[0], {
      since: NOW - 90 * DAY,
      modified: NOW - DAY,
    });
    clock += 4 * DAY;
    await store.refresh();
    assert.deepEqual(windows[1], {
      since: clock - 90 * DAY,
      modified: NOW - 1000,
    });
    assert.equal(
      (await readSavedHistory(directory))?.rows[0]?.totals.input,
      100,
    );
  } finally {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("failed scans retain the checkpoint so recovery cannot skip usage", async () => {
  const directory = await mkdtemp(join(tmpdir(), "paseo-cache-recovery-"));
  const checkpoint = NOW - 3 * DAY;
  await seed(directory, checkpoint);
  let clock = NOW;
  let fail = true;
  const windows: (number | undefined)[] = [];
  const store = createHistoryStore(
    directory,
    fakeCollectors(async (harness, _since, _signal, modified) => {
      if (harness !== "codex") {
        return { rows: [], incomplete: false };
      }

      windows.push(modified);

      if (fail) {
        throw new Error("private source detail");
      }

      return { rows: [row(150)], incomplete: false };
    }),
    () => clock,
  );

  try {
    await store.refresh();
    assert.equal(
      (await readSavedHistory(directory))?.collectors.codex?.updatedThrough,
      iso(checkpoint),
    );
    const cached = await store.read("chatgpt", inDirectory("/workspace"), 7);
    assert.equal(cached.workspaceTotals.input, 100);
    assert.match(cached.warning, /previously stored/);
    assert.ok(!cached.warning.includes("private"));
    fail = false;
    clock += 2 * DAY;
    await store.refresh();
    assert.equal(windows[1], checkpoint - 1000);
    assert.equal(
      (await readSavedHistory(directory))?.collectors.codex?.updatedThrough,
      iso(clock),
    );
    assert.equal(
      (await store.read("chatgpt", inDirectory("/workspace"), 7))
        .workspaceTotals.input,
      150,
    );
  } finally {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("bounded bootstrap establishes recent coverage and keeps backlog warnings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "paseo-cache-bootstrap-"));
  let clock = NOW;
  const windows: (number | undefined)[] = [];
  const store = createHistoryStore(
    directory,
    fakeCollectors(async (harness, since, _signal, modified) => {
      if (harness !== "codex") {
        return { rows: [], incomplete: false };
      }

      windows.push(modified);

      return { rows: [row()], incomplete: modified === since };
    }),
    () => clock,
  );

  try {
    await store.read("chatgpt", inDirectory("/workspace"), 7);
    assert.deepEqual(windows, [NOW - 90 * DAY, NOW - DAY]);
    assert.equal(
      (await readSavedHistory(directory))?.collectors.codex?.updatedThrough,
      iso(NOW),
    );
    clock += 6 * 60_000;
    await store.refresh();
    assert.equal(windows[2], clock - DAY);
    assert.match(
      (await store.read("chatgpt", inDirectory("/workspace"), 7)).warning,
      /previously stored/,
    );
  } finally {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("closing a background scan cancels it without replacing the saved cache", async () => {
  const directory = await mkdtemp(join(tmpdir(), "paseo-cache-close-"));
  await seed(directory);
  const before = await readFile(join(directory, "history.json"));
  const store = createHistoryStore(
    directory,
    fakeCollectors(async (harness, _since, signal) => {
      if (harness !== "codex") {
        return { rows: [], incomplete: false };
      }

      return {
        rows: await new Promise<HistoryRow[]>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new Error("cancelled")),
            {
              once: true,
            },
          );
        }),
        incomplete: false,
      };
    }),
    () => NOW,
  );

  try {
    assert.equal(
      (await store.read("chatgpt", inDirectory("/workspace"), 7)).refreshing,
      true,
    );
    await store.close();
    assert.deepEqual(await readFile(join(directory, "history.json")), before);
  } finally {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
