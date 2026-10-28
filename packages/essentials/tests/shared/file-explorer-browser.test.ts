import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PAGE_SIZE,
  finishPage,
  pageCandidates,
  parentFolder,
  relativeFilePath,
  searchCandidates,
  searchScore,
  type FileEntry,
} from "../../file-explorer/browser";

test("unsafe workspace paths are rejected", () => {
  for (const path of [
    "/etc/passwd",
    "../secret",
    "a/../b",
    "a//b",
    "a\\b",
    "a\0b",
    ".",
    ".git/config",
    " leading",
    "trailing ",
    "a\nb",
    "a\tb",
    "\uD800",
    "\uDC00",
  ]) {
    assert.equal(relativeFilePath.safeParse(path).success, false, path);
  }
});

test("literal names and parent folders are kept", () => {
  for (const path of [".env", "notes/a b.md", "代码/#%.ts", "pets/🐱.png"]) {
    assert.equal(relativeFilePath.parse(path), path);
  }

  assert.equal(parentFolder("src/nested"), "src");
  assert.equal(parentFolder("src"), "");
  assert.equal(parentFolder(""), "");
});

test("pages list directories first, with no gap or duplicate", () => {
  const entries: FileEntry[] = Array.from(
    { length: PAGE_SIZE * 3 + 7 },
    (_, n) => ({
      path: "entry-" + String(n).padStart(4, "0"),
      kind: n % 2 ? "file" : "directory",
    }),
  );
  assert.equal(pageCandidates(entries, null)[0]?.kind, "directory");
  const seen: FileEntry[] = [];
  let after: FileEntry | null = null;
  do {
    const page = finishPage(pageCandidates(entries, after));
    seen.push(...page.entries);
    after = page.next;
  } while (after);

  assert.equal(new Set(seen.map((entry) => entry.path)).size, entries.length);
  assert.equal(seen.length, entries.length);
  assert.equal(
    seen.findIndex((entry) => entry.kind === "file"),
    Math.ceil(entries.length / 2),
  );
});

test("search matches every word case-insensitively and ranks filenames first", () => {
  const entries: FileEntry[] = [
    { path: "needle/other.ts", kind: "file" },
    { path: "src/needle-helper.ts", kind: "file" },
    { path: "src/Needle", kind: "file" },
    { path: "other.ts", kind: "file" },
  ];
  assert.deepEqual(
    searchCandidates(entries, "", "NEEDLE").map((entry) => entry.path),
    ["src/Needle", "src/needle-helper.ts", "needle/other.ts"],
  );
  assert.notEqual(searchScore("bb/server/files.ts", "", "SERVER files"), null);
  assert.equal(searchScore("bb/client/files.ts", "", "SERVER files"), null);
  assert.notEqual(searchScore("src/deep/a.ts", "src", "deep a.ts"), null);
  assert.equal(searchScore("outside/a.ts", "src", "a.ts"), null);
});
