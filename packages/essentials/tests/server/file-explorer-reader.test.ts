import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import type { Dir } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  opendir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { PAGE_SIZE, type FileEntry } from "../../file-explorer/browser";
import {
  readDirectory,
  searchFiles,
  type DirectoryIO,
} from "../../file-explorer/reader";

const roots: string[] = [];

async function tempDir(): Promise<string> {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "essentials-file-explorer-")),
  );
  roots.push(root);

  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const live = () => new AbortController().signal;
const request = {
  folder: "",
  showHidden: true,
  showIgnored: true,
  query: "needle",
};

function hasRipgrep(): boolean {
  try {
    execFileSync("rg", ["--version"], { stdio: "ignore" });

    return true;
  } catch {
    return false;
  }
}

const skip = !hasRipgrep();
const top = {
  folder: "",
  showHidden: true,
  showIgnored: true,
  filter: "",
  after: null,
};

/** Real file system calls that abort `controller` after `abortWhen` holds. */
function abortingIO(
  controller: AbortController,
  handles: Dir[],
  abortWhen: (path: string) => boolean,
): DirectoryIO {
  return {
    canonicalize: (path) => realpath(path),
    open: async (path) => {
      const directory = await opendir(path);
      handles.push(directory);

      return (async function* () {
        for await (const entry of directory) {
          yield entry;

          if (abortWhen(path)) {
            controller.abort();
          }
        }
      })();
    },
  };
}

test("directory pages prune candidates and list mixed entries without gaps", async () => {
  const root = await tempDir();
  const total = PAGE_SIZE * 5 + 17;
  const directories = ["nested"];
  const files = [".env"];
  await mkdir(join(root, "nested"));
  await mkdir(join(root, ".git"));
  await writeFile(join(root, ".env"), "");
  await writeFile(join(root, "nested", "deep.pdf"), "");

  for (let n = 0; n < total; n++) {
    const name = (n % 2 ? "file-" : "dir-") + String(n).padStart(4, "0");

    if (n % 2) {
      await writeFile(join(root, name), "");
      files.push(name);
    } else {
      await mkdir(join(root, name));
      directories.push(name);
    }
  }

  const paths: string[] = [];
  let after: FileEntry | null = null;
  do {
    const page = await readDirectory(root, { ...top, after }, live());
    paths.push(...page.entries.map((entry) => entry.path));
    after = page.next;
  } while (after);

  assert.deepEqual(paths, [...directories.sort(), ...files.sort()]);
  assert.equal(new Set(paths).size, paths.length);
  const nested = await readDirectory(
    root,
    { ...top, folder: "nested" },
    live(),
  );
  assert.deepEqual(nested.entries, [{ path: "nested/deep.pdf", kind: "file" }]);
  const match = "file-" + String(total - 2).padStart(4, "0");
  const filtered = await readDirectory(root, { ...top, filter: match }, live());
  assert.deepEqual(
    filtered.entries.map((entry) => entry.path),
    [match],
  );
});

test("listing rejects traversal and escaping links, and hides link entries", async () => {
  const root = await tempDir();
  const outside = await tempDir();
  await symlink(outside, join(root, "escape"), "dir");
  await assert.rejects(readDirectory(root, { ...top, folder: "../x" }, live()));
  await assert.rejects(
    readDirectory(root, { ...top, folder: "escape" }, live()),
    /outside/,
  );
  assert.deepEqual((await readDirectory(root, top, live())).entries, []);
  const stopped = new AbortController();
  stopped.abort();
  await assert.rejects(readDirectory(root, top, stopped.signal));
});

test("cancelling a listing closes the directory handle", async () => {
  const root = await tempDir();
  await writeFile(join(root, "a"), "");
  await writeFile(join(root, "b"), "");
  const controller = new AbortController();
  const handles: Dir[] = [];
  await assert.rejects(
    readDirectory(
      root,
      top,
      controller.signal,
      abortingIO(controller, handles, () => true),
    ),
  );
  const [handle] = handles;
  assert.ok(handle && handles.length === 1);
  await assert.rejects(handle.read(), { code: "ERR_DIR_CLOSED" });
});

test("a listing checks cancellation between canonicalizations", async () => {
  const controller = new AbortController();
  let canonicalizations = 0;
  const io: DirectoryIO = {
    canonicalize: async (path) => {
      canonicalizations++;
      controller.abort();

      return path;
    },
    open: async () => {
      throw new Error("must not open");
    },
  };
  await assert.rejects(readDirectory("/workspace", top, controller.signal, io));
  assert.equal(canonicalizations, 1);
});

test(
  "search finds nested files in the folder, skips caches, and follows no link",
  { skip },
  async () => {
    const root = await tempDir();
    const outside = await tempDir();

    for (const dir of [
      "src/deep",
      "src/needle-folder",
      ".config",
      ".git",
      "node_modules",
      ".venv",
    ]) {
      await mkdir(join(root, dir), { recursive: true });
    }

    for (const path of [
      "Needle.ts",
      "src/deep/needle-helper.ts",
      "src/needle-folder/other.ts",
      ".config/needle.json",
      ".git/needle-secret",
      "node_modules/needle-dependency",
      ".venv/needle-cache",
    ]) {
      await writeFile(join(root, path), "");
    }

    await writeFile(join(outside, "needle-outside"), "");
    await symlink(outside, join(root, "escape"), "dir");
    const all = await searchFiles(
      root,
      { folder: "", showHidden: true, showIgnored: true, query: "NEEDLE" },
      live(),
    );
    assert.deepEqual(
      new Set(all.entries.map((entry) => entry.path)),
      new Set([
        "Needle.ts",
        "src/deep/needle-helper.ts",
        "src/needle-folder/other.ts",
        ".config/needle.json",
      ]),
    );
    assert.equal(all.limited, false);
    assert.equal(all.truncated, false);
    const scoped = await searchFiles(
      root,
      {
        folder: "src",
        showHidden: true,
        showIgnored: true,
        query: "deep helper",
      },
      live(),
    );
    assert.deepEqual(scoped.entries, [
      { path: "src/deep/needle-helper.ts", kind: "file" },
    ]);
    await assert.rejects(
      searchFiles(
        root,
        {
          folder: "escape",
          showHidden: true,
          showIgnored: true,
          query: "needle",
        },
        live(),
      ),
      /outside/,
    );
  },
);

test("search bounds and ranks results", { skip }, async () => {
  const root = await tempDir();

  for (let n = 0; n < PAGE_SIZE * 3; n++) {
    await writeFile(join(root, "needle-" + String(n).padStart(4, "0")), "");
  }

  await writeFile(join(root, "needle"), "");
  const result = await searchFiles(root, request, live());
  assert.equal(result.entries.length, PAGE_SIZE);
  assert.equal(result.entries[0]?.path, "needle");
  assert.equal(result.truncated, true);
  assert.equal(result.limited, false);
});

test("search has no depth limit", { skip }, async () => {
  const root = await tempDir();
  const deep = Array.from({ length: 80 }, (_, n) => "d" + String(n)).join("/");
  await mkdir(join(root, deep), { recursive: true });
  await writeFile(join(root, deep, "needle.ts"), "");
  const result = await searchFiles(root, request, live());
  assert.deepEqual(result, {
    entries: [{ path: deep + "/needle.ts", kind: "file" }],
    truncated: false,
    limited: false,
  });
});

test("the deadline returns a partial search, and cancellation rejects", async () => {
  const root = await tempDir();
  // A stand-in for ripgrep that lists one file, then hangs.
  const bin = join(root, "slow-rg");
  await writeFile(bin, "#!/bin/sh\nprintf 'needle.ts\\0'\nexec sleep 30\n");
  await chmod(bin, 0o755);
  const partial = await searchFiles(root, request, live(), {
    bin,
    timeoutMs: 1_000,
  });
  assert.deepEqual(partial, {
    entries: [{ path: "needle.ts", kind: "file" }],
    truncated: false,
    limited: true,
  });
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 50);
  await assert.rejects(searchFiles(root, request, controller.signal, { bin }));
  await assert.rejects(
    searchFiles(root, request, live(), { bin: join(root, "no-rg") }),
    /ripgrep \(rg\) is not installed/,
  );
});

test(
  "search keeps other results when a nested folder is unreadable",
  { skip: skip || process.getuid?.() === 0 },
  async () => {
    const root = await tempDir();
    await mkdir(join(root, "blocked"));
    await writeFile(join(root, "blocked", "needle-secret.ts"), "");
    await writeFile(join(root, "needle.ts"), "");
    await chmod(join(root, "blocked"), 0o000);

    try {
      const result = await searchFiles(root, request, live());
      assert.deepEqual(result, {
        entries: [{ path: "needle.ts", kind: "file" }],
        limited: true,
        truncated: false,
      });
    } finally {
      await chmod(join(root, "blocked"), 0o755);
    }
  },
);

test(
  "hidden entries are left out when showHidden is off",
  { skip },
  async () => {
    const root = await tempDir();
    await mkdir(join(root, ".github"));
    await mkdir(join(root, "src"));
    await writeFile(join(root, ".env"), "");
    await writeFile(join(root, ".github", "needle.yml"), "");
    await writeFile(join(root, "src", ".needle-hidden"), "");
    await writeFile(join(root, "src", "needle.ts"), "");
    const hidden = { ...top, showHidden: false };
    assert.deepEqual(
      (await readDirectory(root, hidden, live())).entries.map((e) => e.path),
      ["src"],
    );
    assert.deepEqual(
      (await readDirectory(root, top, live())).entries.map((e) => e.path),
      [".github", "src", ".env"],
    );
    const found = await searchFiles(
      root,
      { ...request, showHidden: false },
      live(),
    );
    assert.deepEqual(found.entries, [{ path: "src/needle.ts", kind: "file" }]);
  },
);
