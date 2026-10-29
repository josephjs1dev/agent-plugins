import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import type { ContentSearchRequest } from "../../file-explorer/content";
import { searchContent } from "../../file-explorer/content-search";

const roots: string[] = [];
const live = () => new AbortController().signal;
const request: ContentSearchRequest = {
  folder: "",
  query: "needle",
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  include: "",
  exclude: "",
  showHidden: true,
  showIgnored: false,
};

function has(command: string): boolean {
  try {
    execFileSync(command, ["--version"], { stdio: "ignore" });

    return true;
  } catch {
    return false;
  }
}

const skip = !has("rg") || !has("git");

async function workspace(): Promise<string> {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "essentials-file-explorer-content-")),
  );
  roots.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root, stdio: "ignore" });
  await writeFile(join(root, ".gitignore"), "*.log\n");
  await mkdir(join(root, "src"));
  await mkdir(join(root, "node_modules"));
  await mkdir(join(root, ".github"));
  await writeFile(join(root, "src", "a.ts"), "const Needle = 1;\nneedles();\n");
  await writeFile(join(root, "src", "b.tsx"), "// needle\n");
  await writeFile(join(root, "notes.md"), "é needle\n");
  await writeFile(join(root, "debug.log"), "needle\n");
  await writeFile(join(root, ".github", "ci.yml"), "needle\n");
  await writeFile(join(root, "node_modules", "dep.js"), "needle\n");

  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const paths = (result: { files: { path: string }[] }) =>
  result.files.map((file) => file.path);

test(
  "a content search finds lines and skips ignored and dependency files",
  { skip },
  async () => {
    const root = await workspace();
    const result = await searchContent(root, request, live());
    assert.deepEqual(paths(result), [
      ".github/ci.yml",
      "notes.md",
      "src/a.ts",
      "src/b.tsx",
    ]);
    assert.equal(result.matches, 5);
    assert.deepEqual(result.files[1]?.matches[0], {
      line: 1,
      column: 3,
      text: "é needle",
      ranges: [{ start: 2, end: 8 }],
    });
    assert.deepEqual(
      paths(
        await searchContent(root, { ...request, showIgnored: true }, live()),
      ),
      [".github/ci.yml", "debug.log", "notes.md", "src/a.ts", "src/b.tsx"],
    );
    assert.deepEqual(
      paths(
        await searchContent(root, { ...request, showHidden: false }, live()),
      ),
      ["notes.md", "src/a.ts", "src/b.tsx"],
    );
  },
);

test("the options and globs narrow a content search", { skip }, async () => {
  const root = await workspace();
  const search = (patch: Partial<ContentSearchRequest>) =>
    searchContent(root, { ...request, ...patch }, live());
  assert.equal((await search({ caseSensitive: true })).matches, 4);
  assert.equal((await search({ wholeWord: true })).matches, 4);
  assert.deepEqual(paths(await search({ regex: true, query: "^const N" })), [
    "src/a.ts",
  ]);
  assert.deepEqual(paths(await search({ include: "*.{ts,tsx}" })), [
    "src/a.ts",
    "src/b.tsx",
  ]);
  assert.deepEqual(paths(await search({ exclude: "src, .github" })), [
    "notes.md",
  ]);
  assert.deepEqual(paths(await search({ folder: "src" })), [
    "src/a.ts",
    "src/b.tsx",
  ]);
  assert.deepEqual(paths(await search({ include: "*.none" })), []);
  assert.deepEqual(paths(await search({ query: "absent" })), []);
});

test(
  "a content search rejects bad patterns and folders",
  { skip },
  async () => {
    const root = await workspace();
    const outside = await realpath(
      await mkdtemp(join(tmpdir(), "essentials-file-explorer-outside-")),
    );
    roots.push(outside);
    await symlink(outside, join(root, "escape"));
    await assert.rejects(
      searchContent(root, { ...request, regex: true, query: "(" }, live()),
      /regex parse error/,
    );
    await assert.rejects(
      searchContent(root, { ...request, folder: "escape" }, live()),
      /outside the workspace/,
    );
    await assert.rejects(
      searchContent(root, { ...request, folder: "gone" }, live()),
      /no longer exists/,
    );
    await assert.rejects(
      searchContent(root, { ...request, folder: "../x" }, live()),
    );
    const stopped = new AbortController();
    stopped.abort();
    await assert.rejects(searchContent(root, request, stopped.signal));
  },
);

test("a missing ripgrep says how to fix it", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "essentials-file-explorer-content-")),
  );
  roots.push(root);
  await assert.rejects(
    searchContent(root, request, live(), { bin: join(root, "no-rg") }),
    /ripgrep \(rg\) is not installed/,
  );
});
