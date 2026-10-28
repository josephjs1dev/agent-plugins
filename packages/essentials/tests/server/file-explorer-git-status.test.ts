import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readGitStatus, type RunGit } from "../../file-explorer/git-status";

const live = () => new AbortController().signal;

function hasGit(): boolean {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });

    return true;
  } catch {
    return false;
  }
}

test("a folder outside a work tree reports no repository", async () => {
  const notRepository: RunGit = async () => {
    throw Object.assign(new Error("not a git repository"), { code: 128 });
  };

  assert.deepEqual(await readGitStatus(tmpdir(), live(), notRepository), {
    repository: false,
    entries: [],
    truncated: false,
  });
});

test("a failed status read reports a generic error", async () => {
  const failing: RunGit = async (args) => {
    if (args[0] === "rev-parse") {
      return "\n";
    }

    throw new Error("fatal: secret detail");
  };

  await assert.rejects(readGitStatus(tmpdir(), live(), failing), {
    message: "Could not read the Git status.",
  });
});

test(
  "a real work tree reports changes relative to the workspace",
  { skip: !hasGit() },
  async () => {
    const repository = await realpath(
      await mkdtemp(join(tmpdir(), "essentials-file-explorer-git-")),
    );

    try {
      const git = (...args: string[]) =>
        execFileSync("git", args, { cwd: repository, stdio: "ignore" });
      git("init", "-q");
      const app = join(repository, "app");
      await mkdir(join(app, "fresh"), { recursive: true });
      await writeFile(join(app, "tracked.ts"), "one");
      await writeFile(join(app, ".gitignore"), "build/\n");
      git("add", ".");
      git(
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.com",
        "commit",
        "-qm",
        "start",
      );
      await writeFile(join(app, "tracked.ts"), "two");
      await writeFile(join(app, "fresh", "new.ts"), "");
      await mkdir(join(app, "build"));
      await writeFile(join(app, "build", "out.js"), "");
      await writeFile(join(repository, "outside.ts"), "");
      const result = await readGitStatus(app, live());
      assert.equal(result.repository, true);
      assert.deepEqual(
        new Set(result.entries.map((e) => JSON.stringify(e))),
        new Set(
          [
            { path: "tracked.ts", status: "modified", directory: false },
            { path: "fresh", status: "untracked", directory: true },
            { path: "build", status: "ignored", directory: true },
          ].map((e) => JSON.stringify(e)),
        ),
      );
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  },
);
