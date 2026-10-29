import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { deleteClaudeSession } from "../../cleaner/claude-session";
import { resolveProviderHome } from "../../cleaner/provider-home";
import { cleanupThreadSessions } from "../../cleaner/thread-cleanup";

const id = "01a185c9-3796-7ba2-b826-80754ac76cbb";
const other = "01a185c5-4e00-7d80-833d-237274248b46";
const roots: string[] = [];
const live = () => new AbortController().signal;

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "essentials-cleaner-")),
  );
  roots.push(root);
  const home = join(root, "claude");
  const project = join(home, "projects", "-work-project");
  await mkdir(join(project, id, "subagents"), { recursive: true });
  await mkdir(join(home, "todos"));
  await mkdir(join(home, "tasks", id), { recursive: true });
  await writeFile(join(project, `${id}.jsonl`), JSON.stringify({ id }));
  await writeFile(join(project, `${other}.jsonl`), "keep");
  await writeFile(join(project, id, "subagents", "agent.jsonl"), "child");
  await writeFile(join(home, "todos", `${id}-agent-main.json`), "todo");
  await writeFile(join(home, "todos", `${other}-agent-main.json`), "keep");

  return { root, home, project };
}

async function assertMissing(path: string) {
  await assert.rejects(stat(path), { code: "ENOENT" });
}

test("Claude deletion removes only the session's files, and repeats safely", async () => {
  const { home, project } = await fixture();
  await deleteClaudeSession(home, id, live());
  await deleteClaudeSession(home, id, live());
  await assertMissing(join(project, `${id}.jsonl`));
  await assertMissing(join(project, id));
  await assertMissing(join(home, "tasks", id));
  await assertMissing(join(home, "todos", `${id}-agent-main.json`));
  assert.equal(await readFile(join(project, `${other}.jsonl`), "utf8"), "keep");
  assert.equal(
    await readFile(join(home, "todos", `${other}-agent-main.json`), "utf8"),
    "keep",
  );
});

test("Claude deletion refuses a symlinked transcript and keeps its target", async () => {
  const { root, home, project } = await fixture();
  const victim = join(root, "keep");
  await writeFile(victim, "safe");
  await rm(join(project, `${id}.jsonl`));
  await symlink(victim, join(project, `${id}.jsonl`));
  await assert.rejects(deleteClaudeSession(home, id, live()), /symlink/);
  assert.equal(await readFile(victim, "utf8"), "safe");
});

test("a cancelled Claude deletion deletes nothing", async () => {
  const { home, project } = await fixture();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(deleteClaudeSession(home, id, controller.signal));
  assert.match(await readFile(join(project, `${id}.jsonl`), "utf8"), /01a1/);
});

test("Claude deletion rejects an ID that is not a UUID", async () => {
  const { home } = await fixture();
  await assert.rejects(deleteClaudeSession(home, "../projects", live()));
});

test("cleanup waits until the observed bb thread storage is gone", async () => {
  const { root, home, project } = await fixture();
  const storagePath = join(root, "thr_test");
  await mkdir(storagePath);
  const target = {
    threadId: "thr_test",
    storagePath,
    storageObserved: true,
    sessions: [{ id, provider: "claude-code" as const, home }],
  };
  let resolved = 0;
  const options = {
    codexBin: () => {
      resolved++;

      return "codex";
    },
  };

  assert.equal(
    (await cleanupThreadSessions(target, options, live())).state,
    "waiting",
  );
  const unobserved = {
    ...target,
    threadId: "thr_absent",
    storagePath: join(root, "thr_absent"),
    storageObserved: false,
  };
  assert.equal(
    (await cleanupThreadSessions(unobserved, options, live())).state,
    "waiting",
  );
  assert.match(await readFile(join(project, `${id}.jsonl`), "utf8"), /01a1/);

  await rm(storagePath, { recursive: true });
  assert.deepEqual(await cleanupThreadSessions(target, options, live()), {
    state: "done",
    deleted: 1,
    message: null,
  });
  await assertMissing(join(project, `${id}.jsonl`));
  assert.equal(resolved, 0);
});

test("cleanup rejects a storage path that does not name the thread", async () => {
  await assert.rejects(
    cleanupThreadSessions(
      {
        threadId: "thr_a",
        storagePath: "/tmp/thr_b",
        storageObserved: true,
        sessions: [],
      },
      { codexBin: () => "codex" },
      live(),
    ),
    /Invalid bb thread-storage target/,
  );
});

test("the provider home is the recorded one, then the variable, then the default", () => {
  const session = { provider: "codex" as const, home: null };
  assert.equal(
    resolveProviderHome({ ...session, home: "/custom" }, {}, "/u"),
    "/custom",
  );
  assert.equal(
    resolveProviderHome(session, { CODEX_HOME: "~/codex" }, "/u"),
    "/u/codex",
  );
  assert.equal(resolveProviderHome(session, {}, "/u"), "/u/.codex");
  assert.equal(
    resolveProviderHome({ provider: "claude-code", home: null }, {}, "/u"),
    "/u/.claude",
  );
  assert.throws(() => resolveProviderHome({ ...session, home: "rel" }, {}));
  assert.throws(() => resolveProviderHome({ ...session, home: "/" }, {}));
});
