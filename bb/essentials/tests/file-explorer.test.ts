import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  createFakePluginHost,
  makeThreadResponse,
  type ExperimentalFakeHostRpcCall,
} from "@get-bb/plugin-sdk/testing";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import hostEntry from "../host";
import plugin from "../server";

function hasRipgrep(): boolean {
  try {
    execFileSync("rg", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

interface Source {
  id: string;
  hostId: string;
  path: string;
  isDefault: boolean;
}

interface Workspace {
  environmentId?: string | null;
  status?: string;
  /** The checkouts of project `p`. */
  sources?: Source[];
  callHostRpc?: (call: ExperimentalFakeHostRpcCall) => unknown;
}

/**
 * A plugin whose thread `t` lives in `/work/repo` on `remote-host`, and whose
 * project `p` has `sources`.
 */
function loaded({
  environmentId = "env",
  status = "ready",
  sources = [],
  callHostRpc,
}: Workspace = {}) {
  const host = createFakePluginHost({
    pluginId: "essentials",
    sdk: {
      threads: {
        get: async () => makeThreadResponse({ id: "t", environmentId }),
        list: async () => [],
      },
      environments: {
        get: async () => ({
          id: "env",
          path: "/work/repo",
          hostId: "remote-host",
          status,
        }),
      },
      projects: {
        get: async () => ({
          id: "p",
          sources: sources.map((source) => ({
            ...source,
            projectId: "p",
            type: "local_path" as const,
            createdAt: 0,
            updatedAt: 0,
          })),
        }),
      },
    },
    ...(callHostRpc ? { experimental_callHostRpc: callHostRpc } : {}),
  });
  plugin(host.bb);

  return host;
}

const T = { kind: "thread", threadId: "t" } as const;
const ROOT = {
  key: "env",
  preview: { kind: "workspace", environmentId: "env" },
};

const list = {
  target: T,
  folder: "",
  showHidden: true,
  showIgnored: true,
  filter: "",
  after: null,
};

void test("a listing reads the thread's checkout on its host and rejects caller roots", async () => {
  const host = loaded({ callHostRpc: () => ({ entries: [], next: null }) });
  try {
    assert.deepEqual(
      await host.harness.behavior.callRpc("file_explorer.list", {
        ...list,
        folder: "nested",
      }),
      { root: ROOT, entries: [], next: null },
    );
    const [call] = host.harness.inspection.experimental_hostRpcCalls;
    assert.equal(call?.method, "file_explorer.directory");
    assert.equal(call.hostId, "remote-host");
    assert.deepEqual(call.input, {
      rootPath: "/work/repo",
      folder: "nested",
      showHidden: true,
      showIgnored: true,
      filter: "",
      after: null,
    });
    await assert.rejects(
      host.harness.behavior.callRpc("file_explorer.list", {
        ...list,
        rootPath: "/etc",
        hostId: "other",
      }),
    );
  } finally {
    await host.harness.lifecycle.dispose();
  }
});

void test("a thread without a live workspace reads nothing", async () => {
  for (const workspace of [{ environmentId: null }, { status: "destroyed" }]) {
    const host = loaded(workspace);
    try {
      assert.deepEqual(
        await host.harness.behavior.callRpc("file_explorer.list", list),
        {
          root: null,
          entries: [],
          next: null,
        },
      );
      assert.equal(host.harness.inspection.experimental_hostRpcCalls.length, 0);
    } finally {
      await host.harness.lifecycle.dispose();
    }
  }
});

void test("disposal cancels an outstanding host read", async () => {
  let started = () => {};
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const host = loaded({
    callHostRpc: ({ signal }) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("cancelled")));
        started();
      }),
  });
  const pending = assert.rejects(
    host.harness.behavior.callRpc("file_explorer.list", list),
  );
  await ready;
  await host.harness.lifecycle.dispose();
  await pending;
});

void test("a search uses the thread's root and host and a relative folder", async () => {
  const found = {
    entries: [{ kind: "file", path: "docs/deep/needle.ts" }],
    truncated: false,
    limited: false,
  };
  const host = loaded({ callHostRpc: () => found });
  const search = {
    target: T,
    showHidden: true,
    showIgnored: true,
    query: "needle",
    sessionId: "client",
  };
  try {
    assert.deepEqual(
      await host.harness.behavior.callRpc("file_explorer.search", {
        ...search,
        folder: "docs",
      }),
      { ...found, root: ROOT },
    );
    const [call] = host.harness.inspection.experimental_hostRpcCalls;
    assert.equal(call?.method, "file_explorer.search");
    assert.equal(call.hostId, "remote-host");
    assert.deepEqual(call.input, {
      rootPath: "/work/repo",
      folder: "docs",
      showHidden: true,
      showIgnored: true,
      query: "needle",
    });
    await assert.rejects(
      host.harness.behavior.callRpc("file_explorer.search", {
        ...search,
        folder: "../elsewhere",
      }),
    );
    await assert.rejects(
      host.harness.behavior.callRpc("file_explorer.search", {
        ...search,
        folder: "",
        rootPath: "/etc",
      }),
    );
  } finally {
    await host.harness.lifecycle.dispose();
  }
});

void test("a new search cancels the explorer's older one, not another explorer's", async () => {
  const signals = new Map<string, AbortSignal>();
  let ready = () => {};
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const host = loaded({
    callHostRpc: ({ input, signal }) => {
      const { query } = input as { query: string };
      if (query === "new" || !signal) {
        return { entries: [], truncated: false, limited: false };
      }

      signals.set(query, signal);

      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("cancelled")));
        if (signals.size === 2) {
          ready();
        }
      });
    },
  });
  const search = (query: string, sessionId: string) =>
    host.harness.behavior.callRpc("file_explorer.search", {
      target: T,
      folder: "",
      showHidden: true,
      showIgnored: true,
      query,
      sessionId,
    });
  const first = assert.rejects(search("old", "one"));
  const other = assert.rejects(search("other", "two"));
  try {
    await started;
    await search("new", "one");
    await first;
    assert.equal(signals.get("old")?.aborted, true);
    assert.equal(signals.get("other")?.aborted, false);
  } finally {
    await host.harness.lifecycle.dispose();
  }

  await other;
  assert.equal(signals.get("other")?.aborted, true);
});

void test("the host entry lists, searches, reads Git, and deletes in a real checkout", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "bb-file-explorer-")),
  );
  const harness = experimental_createHostEntryHarness(hostEntry);
  try {
    await mkdir(join(root, "src", "deep"), { recursive: true });
    await mkdir(join(root, ".git"));
    await writeFile(join(root, "src", "deep", "needle.ts"), "");
    await writeFile(join(root, "README.md"), "");
    const page = await harness.experimental_call("file_explorer.directory", {
      rootPath: root,
      folder: "",
      showHidden: true,
      showIgnored: true,
      filter: "",
      after: null,
    });
    assert.deepEqual(page, {
      entries: [
        { path: "src", kind: "directory" },
        { path: "README.md", kind: "file" },
      ],
      next: null,
    });
    const found = await harness.experimental_call("file_explorer.search", {
      rootPath: root,
      folder: "src",
      showHidden: true,
      showIgnored: true,
      query: "needle",
    });
    assert.deepEqual(found.entries, [
      { path: "src/deep/needle.ts", kind: "file" },
    ]);
    const status = await harness.experimental_call("file_explorer.git_status", {
      rootPath: root,
    });
    assert.equal(status.repository, false);
    await harness.experimental_call("file_explorer.delete", {
      rootPath: root,
      entry: { path: "src", kind: "directory" },
    });
    assert.deepEqual(
      (
        await harness.experimental_call("file_explorer.directory", {
          rootPath: root,
          folder: "",
          showHidden: true,
          showIgnored: true,
          filter: "",
          after: null,
        })
      ).entries,
      [{ path: "README.md", kind: "file" }],
    );
    await assert.rejects(
      harness.experimental_call("file_explorer.directory", {
        rootPath: "relative",
        folder: "",
        showHidden: true,
        showIgnored: true,
        filter: "",
        after: null,
      }),
    );
  } finally {
    await harness.experimental_dispose();
    await rm(root, { recursive: true, force: true });
  }
});

void test("a delete and a Git read go to the thread's checkout on its host", async () => {
  const host = loaded({
    callHostRpc: ({ method }) =>
      method === "file_explorer.delete"
        ? { path: "src/a.ts" }
        : { repository: true, entries: [], truncated: false },
  });
  try {
    assert.deepEqual(
      await host.harness.behavior.callRpc("file_explorer.delete", {
        target: T,
        rootKey: "env",
        entry: { path: "src/a.ts", kind: "file" },
      }),
      { path: "src/a.ts" },
    );
    assert.deepEqual(
      await host.harness.behavior.callRpc("file_explorer.git_status", {
        target: T,
      }),
      { root: ROOT, repository: true, entries: [], truncated: false },
    );
    const calls = host.harness.inspection.experimental_hostRpcCalls;
    assert.deepEqual(
      calls.map(({ method, hostId, input }) => ({ method, hostId, input })),
      [
        {
          method: "file_explorer.delete",
          hostId: "remote-host",
          input: {
            rootPath: "/work/repo",
            entry: { path: "src/a.ts", kind: "file" },
          },
        },
        {
          method: "file_explorer.git_status",
          hostId: "remote-host",
          input: { rootPath: "/work/repo" },
        },
      ],
    );
    for (const entry of [
      { path: "../outside", kind: "file" },
      { path: ".git", kind: "directory" },
      { path: "src", kind: "symlink" },
    ]) {
      await assert.rejects(
        host.harness.behavior.callRpc("file_explorer.delete", {
          target: T,
          rootKey: "env",
          entry,
        }),
      );
    }
    await assert.rejects(
      host.harness.behavior.callRpc("file_explorer.delete", {
        target: T,
        rootKey: "env",
        entry: { path: "a", kind: "file" },
        rootPath: "/etc",
      }),
    );
    await assert.rejects(
      host.harness.behavior.callRpc("file_explorer.delete", {
        target: T,
        rootKey: "other-env",
        entry: { path: "src/a.ts", kind: "file" },
      }),
      /workspace changed/,
    );
    assert.equal(calls.length, 2);
  } finally {
    await host.harness.lifecycle.dispose();
  }
});

void test("a delete in a thread without a live workspace fails", async () => {
  const host = loaded({ environmentId: null });
  try {
    await assert.rejects(
      host.harness.behavior.callRpc("file_explorer.delete", {
        target: T,
        rootKey: "env",
        entry: { path: "a.ts", kind: "file" },
      }),
      /not available/,
    );
    assert.equal(host.harness.inspection.experimental_hostRpcCalls.length, 0);
  } finally {
    await host.harness.lifecycle.dispose();
  }
});

/** A content search as the host receives it, without `rootPath`. */
const contentInput = {
  folder: "",
  query: "needle",
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  include: "*.ts",
  exclude: "",
  showHidden: true,
  showIgnored: false,
};
const content = { target: T, sessionId: "client", ...contentInput };
const noContent = { files: [], matches: 0, truncated: false, limited: false };

void test("a project target reads the project's default checkout", async () => {
  const host = loaded({
    sources: [
      { id: "first", hostId: "h1", path: "/work/first", isDefault: false },
      { id: "main", hostId: "h2", path: "/work/main", isDefault: true },
    ],
    callHostRpc: ({ method }) =>
      method === "file_explorer.content"
        ? noContent
        : { entries: [], next: null },
  });
  const P = { kind: "project", projectId: "p" } as const;
  const root = {
    key: "source:main",
    preview: { kind: "host", hostId: "h2", path: "/work/main" },
  };
  try {
    assert.deepEqual(
      await host.harness.behavior.callRpc("file_explorer.list", {
        ...list,
        target: P,
      }),
      { root, entries: [], next: null },
    );
    assert.deepEqual(
      await host.harness.behavior.callRpc("file_explorer.content", {
        ...content,
        target: P,
      }),
      { ...noContent, root },
    );
    assert.deepEqual(
      host.harness.inspection.experimental_hostRpcCalls.map(
        ({ method, hostId, input }) => [
          method,
          hostId,
          (input as { rootPath: string }).rootPath,
        ],
      ),
      [
        ["file_explorer.directory", "h2", "/work/main"],
        ["file_explorer.content", "h2", "/work/main"],
      ],
    );
  } finally {
    await host.harness.lifecycle.dispose();
  }
});

void test("a project without a checkout reads nothing", async () => {
  const host = loaded();
  try {
    assert.deepEqual(
      await host.harness.behavior.callRpc("file_explorer.content", {
        ...content,
        target: { kind: "project", projectId: "p" },
      }),
      { ...noContent, root: null },
    );
    assert.equal(host.harness.inspection.experimental_hostRpcCalls.length, 0);
  } finally {
    await host.harness.lifecycle.dispose();
  }
});

void test("a content search sends its options to the thread's host", async () => {
  const host = loaded({ callHostRpc: () => noContent });
  try {
    assert.deepEqual(
      await host.harness.behavior.callRpc("file_explorer.content", content),
      { ...noContent, root: ROOT },
    );
    const [call] = host.harness.inspection.experimental_hostRpcCalls;
    assert.equal(call?.method, "file_explorer.content");
    assert.equal(call.hostId, "remote-host");
    assert.deepEqual(call.input, { rootPath: "/work/repo", ...contentInput });
    for (const patch of [
      { folder: "../outside" },
      { query: "" },
      { rootPath: "/etc" },
      { target: { kind: "thread", threadId: "t", rootPath: "/etc" } },
    ]) {
      await assert.rejects(
        host.harness.behavior.callRpc("file_explorer.content", {
          ...content,
          ...patch,
        }),
      );
    }
  } finally {
    await host.harness.lifecycle.dispose();
  }
});

void test("a content search cancels the panel's older content search only", async () => {
  const signals = new Map<string, AbortSignal>();
  let ready = () => {};
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const host = loaded({
    callHostRpc: ({ method, input, signal }) => {
      const { query } = input as { query: string };
      if (query === "new" || !signal) {
        return method === "file_explorer.content"
          ? noContent
          : { entries: [], truncated: false, limited: false };
      }

      signals.set(`${method}:${query}`, signal);

      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("cancelled")));
        if (signals.size === 2) {
          ready();
        }
      });
    },
  });
  const contents = (query: string) =>
    host.harness.behavior.callRpc("file_explorer.content", {
      ...content,
      query,
    });
  const files = assert.rejects(
    host.harness.behavior.callRpc("file_explorer.search", {
      target: T,
      sessionId: "client",
      folder: "",
      showHidden: true,
      showIgnored: true,
      query: "old",
    }),
  );
  const first = assert.rejects(contents("old"));
  try {
    await started;
    await contents("new");
    await first;
    assert.equal(signals.get("file_explorer.content:old")?.aborted, true);
    assert.equal(signals.get("file_explorer.search:old")?.aborted, false);
  } finally {
    await host.harness.lifecycle.dispose();
  }

  await files;
});

void test(
  "the host entry searches file contents in a real checkout",
  {
    skip: !hasRipgrep(),
  },
  async () => {
    const root = await realpath(
      await mkdtemp(join(tmpdir(), "bb-file-explorer-content-")),
    );
    const harness = experimental_createHostEntryHarness(hostEntry);
    try {
      await mkdir(join(root, "src"));
      await writeFile(join(root, "src", "a.ts"), "const needle = 1;\n");
      await writeFile(join(root, "README.md"), "needle\n");
      const result = await harness.experimental_call("file_explorer.content", {
        rootPath: root,
        ...contentInput,
      });
      assert.deepEqual(result, {
        files: [
          {
            path: "src/a.ts",
            matches: [
              {
                line: 1,
                column: 7,
                text: "const needle = 1;",
                ranges: [{ start: 6, end: 12 }],
              },
            ],
          },
        ],
        matches: 1,
        truncated: false,
        limited: false,
      });
    } finally {
      await harness.experimental_dispose();
      await rm(root, { recursive: true, force: true });
    }
  },
);
