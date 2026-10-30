import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { PAGE_SIZE } from "../../file-explorer/browser";
import type { RunGit } from "../../file-explorer/git-status";
import { gitIgnoreRules } from "../../file-explorer/ignored";
import { readDirectory, searchFiles } from "../../file-explorer/reader";

const roots: string[] = [];
const live = () => new AbortController().signal;
const hidden = { showHidden: true, showIgnored: false };

function has(command: string): boolean {
  try {
    execFileSync(command, ["--version"], { stdio: "ignore" });

    return true;
  } catch {
    return false;
  }
}

const hasGit = () => has("git");

async function tempDir(): Promise<string> {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "essentials-file-explorer-ignored-")),
  );
  roots.push(root);

  return root;
}

/** A Git work tree that ignores `x`, `*.log`, and `build/`, and tracks `keep.log`. */
async function repository(): Promise<string> {
  const root = await tempDir();
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init", "-q");
  await writeFile(join(root, ".gitignore"), "x\n*.log\nbuild/\n");
  await mkdir(join(root, "build", "deep"), { recursive: true });
  await mkdir(join(root, "src"));
  await mkdir(join(root, "logs"));

  for (const file of [
    "x",
    "a.log",
    'q"uote.log',
    "keep.log",
    "needle.txt",
    "build/needle.txt",
    "build/deep/needle.txt",
    "src/needle.ts",
    "src/needle.log",
    "logs/needle.log",
  ]) {
    await writeFile(join(root, file), "");
  }

  git("add", "-f", "keep.log");

  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

test(
  "a listing without ignored files drops them and keeps tracked files",
  { skip: !hasGit() },
  async () => {
    const root = await repository();
    const page = await readDirectory(
      root,
      {
        ...hidden,
        folder: "",
        filter: "",
        after: null,
      },
      live(),
    );
    assert.deepEqual(
      page.entries.map((entry) => entry.path),
      ["logs", "src", ".gitignore", "keep.log", "needle.txt"],
    );
    const nested = await readDirectory(
      root,
      {
        ...hidden,
        folder: "src",
        filter: "",
        after: null,
      },
      live(),
    );
    assert.deepEqual(
      nested.entries.map((entry) => entry.path),
      ["src/needle.ts"],
    );
  },
);

test("ignored entries take no page slots", { skip: !hasGit() }, async () => {
  const root = await repository();
  await mkdir(join(root, "many"));

  for (let index = 0; index < PAGE_SIZE * 2; index++) {
    const name = String(index).padStart(4, "0");
    await writeFile(join(root, "many", `${name}.log`), "");

    if (index % 2 === 0) {
      await writeFile(join(root, "many", `${name}.txt`), "");
    }
  }

  const page = await readDirectory(
    root,
    {
      ...hidden,
      folder: "many",
      filter: "",
      after: null,
    },
    live(),
  );
  assert.equal(page.entries.length, PAGE_SIZE);
  assert.ok(page.entries.every((entry) => entry.path.endsWith(".txt")));
  assert.equal(page.next, null);
});

test(
  "a filename search without ignored files skips ignored paths",
  { skip: !hasGit() || !has("rg") },
  async () => {
    const root = await repository();
    const all = await searchFiles(
      root,
      { ...hidden, folder: "", query: "needle" },
      live(),
    );
    assert.deepEqual(
      all.entries.map((entry) => entry.path),
      ["needle.txt", "src/needle.ts"],
    );
    const ignoredFolder = await searchFiles(
      root,
      { ...hidden, folder: "build", query: "needle" },
      live(),
    );
    assert.deepEqual(ignoredFolder.entries, []);
    const nestedIgnored = await searchFiles(
      root,
      { ...hidden, folder: "build/deep", query: "needle" },
      live(),
    );
    assert.deepEqual(nestedIgnored.entries, []);
    const tracked = await searchFiles(
      root,
      { ...hidden, folder: "", query: "keep" },
      live(),
    );
    assert.deepEqual(tracked.entries, [{ path: "keep.log", kind: "file" }]);
    const shown = await searchFiles(
      root,
      { ...hidden, showIgnored: true, folder: "", query: "needle" },
      live(),
    );
    assert.equal(shown.entries.length, 6);
  },
);

test(
  "nothing is ignored outside a Git work tree",
  { skip: !hasGit() || !has("rg") },
  async () => {
    const root = await tempDir();
    await writeFile(join(root, "a.log"), "");
    const page = await readDirectory(
      root,
      {
        ...hidden,
        folder: "",
        filter: "",
        after: null,
      },
      live(),
    );
    assert.deepEqual(page.entries, [{ path: "a.log", kind: "file" }]);
    const found = await searchFiles(
      root,
      { ...hidden, folder: "", query: "a.log" },
      live(),
    );
    assert.deepEqual(found.entries, [{ path: "a.log", kind: "file" }]);
  },
);

test(
  "a failed ignore read reports a generic error",
  { skip: !has("rg") },
  async () => {
    const root = await tempDir();
    await writeFile(join(root, "a.log"), "");
    const failing: RunGit = async () => {
      throw Object.assign(new Error("fatal: secret detail"), {
        code: 128,
        stderr: "fatal: secret detail",
      });
    };

    const rules = gitIgnoreRules(failing);
    const message =
      "Git could not read the ignore rules. Show ignored files to browse without them.";
    await assert.rejects(
      readDirectory(
        root,
        { ...hidden, folder: "", filter: "", after: null },
        live(),
        undefined,
        rules,
      ),
      { message },
    );
    await assert.rejects(
      searchFiles(root, { ...hidden, folder: "", query: "a" }, live(), {
        ignore: rules,
      }),
      { message },
    );
  },
);

test("names go to Git on stdin, NUL-separated and literal", async () => {
  const calls: { args: readonly string[]; input: string | undefined }[] = [];
  const run: RunGit = async (args, _cwd, _signal, input) => {
    calls.push({ args, input });

    return './:magic\0./q"uote\0';
  };

  const ignored = await gitIgnoreRules(run).names(
    "/work",
    [":magic", 'q"uote', "plain"],
    live(),
  );
  assert.deepEqual([...ignored], [":magic", 'q"uote']);
  assert.deepEqual(calls, [
    {
      args: ["check-ignore", "--stdin", "-z"],
      input: './:magic\0./q"uote\0./plain\0',
    },
  ]);
});
