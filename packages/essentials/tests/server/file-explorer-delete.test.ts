import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { deleteEntry } from "../../file-explorer/delete";

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

test("a file or a folder with its contents is deleted", async () => {
  const root = await tempDir();
  await mkdir(join(root, "src", "deep"), { recursive: true });
  await writeFile(join(root, "src", "deep", "a.ts"), "");
  await writeFile(join(root, "keep.ts"), "");
  await writeFile(join(root, "gone.ts"), "");
  assert.deepEqual(
    await deleteEntry(root, { path: "gone.ts", kind: "file" }, live()),
    { path: "gone.ts" },
  );
  await deleteEntry(root, { path: "src", kind: "directory" }, live());
  await assert.rejects(stat(join(root, "gone.ts")), { code: "ENOENT" });
  await assert.rejects(stat(join(root, "src")), { code: "ENOENT" });
  assert.ok((await stat(join(root, "keep.ts"))).isFile());
});

test("a folder delete removes links inside it, never their targets", async () => {
  const root = await tempDir();
  const outside = await tempDir();
  await writeFile(join(outside, "precious"), "");
  await mkdir(join(root, "folder"));
  await symlink(outside, join(root, "folder", "link"), "dir");
  await deleteEntry(root, { path: "folder", kind: "directory" }, live());
  assert.ok((await stat(join(outside, "precious"))).isFile());
});

test("a delete rejects escapes, links, kind changes, and missing entries", async () => {
  const root = await tempDir();
  const outside = await tempDir();
  await writeFile(join(outside, "precious"), "");
  await symlink(outside, join(root, "escape"), "dir");
  await writeFile(join(root, "file"), "");
  await assert.rejects(
    deleteEntry(root, { path: "escape/precious", kind: "file" }, live()),
    /outside/,
  );
  await assert.rejects(
    deleteEntry(root, { path: "escape", kind: "directory" }, live()),
    /changed/,
  );
  await assert.rejects(
    deleteEntry(root, { path: "file", kind: "directory" }, live()),
    /changed/,
  );
  await assert.rejects(
    deleteEntry(root, { path: "missing", kind: "file" }, live()),
    /no longer exists/,
  );
  await assert.rejects(
    deleteEntry(root, { path: "../x", kind: "file" }, live()),
  );
  await assert.rejects(
    deleteEntry(root, { path: ".git", kind: "directory" }, live()),
  );
  const stopped = new AbortController();
  stopped.abort();
  await assert.rejects(
    deleteEntry(root, { path: "file", kind: "file" }, stopped.signal),
  );
  assert.ok((await stat(join(outside, "precious"))).isFile());
  assert.ok((await stat(join(root, "file"))).isFile());
});
