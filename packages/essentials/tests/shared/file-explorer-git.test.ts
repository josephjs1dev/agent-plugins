import assert from "node:assert/strict";
import { test } from "node:test";
import {
  gitStatusOf,
  indexGitStatus,
  parsePorcelain,
  statusOfCode,
} from "../../file-explorer/git";

test("porcelain codes map to statuses", () => {
  assert.equal(statusOfCode("??"), "untracked");
  assert.equal(statusOfCode("!!"), "ignored");
  assert.equal(statusOfCode("UU"), "conflicted");
  assert.equal(statusOfCode("AA"), "conflicted");
  assert.equal(statusOfCode(" D"), "deleted");
  assert.equal(statusOfCode("D "), "deleted");
  assert.equal(statusOfCode("A "), "added");
  assert.equal(statusOfCode("AM"), "added");
  assert.equal(statusOfCode(" M"), "modified");
  assert.equal(statusOfCode("MM"), "modified");
  assert.equal(statusOfCode(" T"), "modified");
});

test("porcelain paths become workspace-relative, outside ones are dropped", () => {
  const output = [
    " M app/src/a.ts",
    "?? app/new/",
    "!! app/node_modules/",
    "A  app/b.ts",
    " M other/c.ts",
    "?? app/bad\\name",
    "",
  ].join("\0");
  assert.deepEqual(parsePorcelain(output, "app/"), {
    repository: true,
    entries: [
      { path: "src/a.ts", status: "modified", directory: false },
      { path: "new", status: "untracked", directory: true },
      { path: "node_modules", status: "ignored", directory: true },
      { path: "b.ts", status: "added", directory: false },
    ],
    truncated: false,
  });
});

test("an entry shows its own, its folder's, or its contents' status", () => {
  const index = indexGitStatus([
    { path: "src/deep/a.ts", status: "modified", directory: false },
    { path: "src/b.ts", status: "untracked", directory: false },
    { path: "src/gone.ts", status: "deleted", directory: false },
    { path: "new", status: "untracked", directory: true },
    { path: "node_modules", status: "ignored", directory: true },
    { path: "docs/x.md", status: "ignored", directory: false },
  ]);
  const status = (path: string, kind: "file" | "directory" = "file") =>
    gitStatusOf(index, { path, kind });
  assert.equal(status("src/deep/a.ts"), "modified");
  assert.equal(status("src", "directory"), "modified");
  assert.equal(status("src/deep", "directory"), "modified");
  assert.equal(status("src/b.ts"), "untracked");
  assert.equal(status("new", "directory"), "untracked");
  assert.equal(status("new/inside/c.ts"), "untracked");
  assert.equal(status("node_modules/pkg", "directory"), "ignored");
  assert.equal(status("docs/x.md"), "ignored");
  // An ignored file does not mark its folder as changed.
  assert.equal(status("docs", "directory"), null);
  assert.equal(status("src/clean.ts"), null);
});
