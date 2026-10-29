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
import { DatabaseSync } from "node:sqlite";
import { afterEach, test } from "node:test";
import { deleteCodexCatalog } from "../../cleaner/codex-catalog";

// The catalog transaction runs in python3's standard-library SQLite, like on
// a host. node:sqlite builds and reads the fixture.
const target = "01a185c9-3796-7ba2-b826-80754ac76cbb";
const other = "01a185c5-4e00-7d80-833d-237274248b46";
const fixtures: { home: string; db: DatabaseSync }[] = [];
const live = () => new AbortController().signal;

afterEach(async () => {
  for (const { home, db } of fixtures.splice(0)) {
    db.close();
    await rm(home, { recursive: true, force: true });
  }
});

async function fixture() {
  const home = await realpath(
    await mkdtemp(join(tmpdir(), "essentials-codex-catalog-")),
  );
  await mkdir(join(home, "sqlite"));
  const path = join(home, "sqlite", "codex-dev.db");
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE local_thread_catalog_hosts (host_id TEXT PRIMARY KEY, host_kind TEXT NOT NULL);
    CREATE TABLE local_thread_catalog (host_id TEXT NOT NULL, thread_id TEXT NOT NULL, display_title TEXT,
      missing_candidate INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(host_id, thread_id));
    CREATE TABLE local_thread_catalog_metadata (id INTEGER PRIMARY KEY, catalog_revision INTEGER NOT NULL CHECK(catalog_revision <= 8));
    CREATE TABLE local_thread_catalog_sync_state (host_id TEXT PRIMARY KEY, observation_sequence INTEGER NOT NULL);
    CREATE TABLE local_thread_catalog_scan_entries (host_id TEXT NOT NULL, thread_id TEXT NOT NULL,
      removed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(host_id, thread_id));
    CREATE TABLE local_thread_catalog_scan_checkpoints (host_id TEXT PRIMARY KEY, checkpoint TEXT);
    CREATE TABLE automations (id TEXT PRIMARY KEY);
    INSERT INTO local_thread_catalog_hosts VALUES ('local', 'local'), ('remote', 'ssh'), ('cloud', 'chatgpt');
    INSERT INTO local_thread_catalog_metadata VALUES (1, 7);
    INSERT INTO local_thread_catalog_sync_state VALUES ('local', 20), ('remote', 30), ('cloud', 40);
    INSERT INTO automations VALUES ('keep-automation');
  `);
  const insert = db.prepare(
    "INSERT INTO local_thread_catalog VALUES (?, ?, ?, 0)",
  );
  insert.run("local", target, "delete");
  insert.run("local", other, "keep");
  insert.run("remote", target, "keep remote");
  insert.run("cloud", target, "keep cloud");
  fixtures.push({ home, db });
  const value = (sql: string, ...params: string[]) =>
    (db.prepare(sql).get(...params) as { value: unknown } | undefined)?.value;

  return {
    home,
    path,
    db,
    revision: () =>
      value(
        "SELECT catalog_revision AS value FROM local_thread_catalog_metadata",
      ),
    sequence: () =>
      value(
        "SELECT observation_sequence AS value FROM local_thread_catalog_sync_state WHERE host_id = 'local'",
      ),
    removed: () =>
      value(
        "SELECT removed AS value FROM local_thread_catalog_scan_entries WHERE host_id = 'local' AND thread_id = ?",
        target,
      ),
    local: () =>
      db
        .prepare(
          "SELECT thread_id FROM local_thread_catalog WHERE host_id = 'local' ORDER BY thread_id",
        )
        .all()
        .map((row) => row.thread_id),
  };
}

test("only the exact local entry goes, with other hosts and app state kept", async () => {
  const f = await fixture();
  assert.deepEqual(await deleteCodexCatalog(f.home, target, live()), {
    removed: 1,
  });
  assert.deepEqual(f.local(), [other]);
  assert.deepEqual(
    f.db
      .prepare(
        "SELECT host_id FROM local_thread_catalog WHERE thread_id = ? ORDER BY host_id",
      )
      .all(target)
      .map((row) => row.host_id),
    ["cloud", "remote"],
  );
  assert.equal(f.revision(), 8);
  assert.equal(f.sequence(), 21);
  assert.equal(f.removed(), 1);
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM automations").get()?.n,
    1,
  );
});

test("a repeat removes nothing and bumps nothing", async () => {
  const f = await fixture();
  await deleteCodexCatalog(f.home, target, live());
  assert.deepEqual(await deleteCodexCatalog(f.home, target, live()), {
    removed: 0,
  });
  assert.equal(f.revision(), 8);
  assert.equal(f.sequence(), 21);
});

test("a scan checkpoint stays and a seen entry becomes a removal marker", async () => {
  const f = await fixture();
  f.db.exec(
    "INSERT INTO local_thread_catalog_scan_checkpoints VALUES ('local', 'keep')",
  );
  f.db
    .prepare(
      "INSERT INTO local_thread_catalog_scan_entries VALUES ('local', ?, 0)",
    )
    .run(target);
  await deleteCodexCatalog(f.home, target, live());
  assert.equal(
    f.db
      .prepare("SELECT checkpoint FROM local_thread_catalog_scan_checkpoints")
      .get()?.checkpoint,
    "keep",
  );
  assert.equal(f.removed(), 1);
});

test("an already hidden entry goes without a visible revision bump", async () => {
  const f = await fixture();
  f.db
    .prepare(
      "UPDATE local_thread_catalog SET missing_candidate = 1 WHERE host_id = 'local' AND thread_id = ?",
    )
    .run(target);
  await deleteCodexCatalog(f.home, target, live());
  assert.deepEqual(f.local(), [other]);
  assert.equal(f.revision(), 7);
});

test("a missing database is not created", async () => {
  const f = await fixture();
  const absent = join(f.home, "other-home");
  await mkdir(join(absent, "sqlite"), { recursive: true });
  assert.deepEqual(await deleteCodexCatalog(absent, target, live()), {
    removed: 0,
  });
  await assert.rejects(stat(join(absent, "sqlite", "codex-dev.db")), {
    code: "ENOENT",
  });
  assert.ok(f.local().includes(target));
});

test("an unsupported schema changes no rows", async () => {
  const f = await fixture();
  f.db.exec(
    "ALTER TABLE local_thread_catalog_scan_entries RENAME COLUMN removed TO unknown_removed",
  );
  await assert.rejects(
    deleteCodexCatalog(f.home, target, live()),
    /Unsupported.*schema/,
  );
  assert.ok(f.local().includes(target));
  assert.equal(f.sequence(), 20);
  assert.equal(f.revision(), 7);
});

test("a failing later statement rolls the whole removal back", async () => {
  const f = await fixture();
  f.db.exec("UPDATE local_thread_catalog_metadata SET catalog_revision = 8");
  await assert.rejects(
    deleteCodexCatalog(f.home, target, live()),
    /CHECK constraint failed/,
  );
  assert.ok(f.local().includes(target));
  assert.equal(f.sequence(), 20);
  assert.equal(
    f.db
      .prepare("SELECT COUNT(*) AS n FROM local_thread_catalog_scan_entries")
      .get()?.n,
    0,
  );
});

test("an unexpected trigger or referencing table is refused", async () => {
  const f = await fixture();
  f.db.exec(
    "CREATE TRIGGER unexpected AFTER DELETE ON local_thread_catalog BEGIN DELETE FROM automations; END",
  );
  await assert.rejects(deleteCodexCatalog(f.home, target, live()), /triggers/);
  f.db.exec("DROP TRIGGER unexpected");
  f.db.exec(
    "CREATE TABLE future_child (host_id TEXT, thread_id TEXT, FOREIGN KEY(host_id, thread_id) REFERENCES LOCAL_THREAD_CATALOG(host_id, thread_id) ON DELETE CASCADE)",
  );
  await assert.rejects(
    deleteCodexCatalog(f.home, target, live()),
    /foreign key references/,
  );
  assert.ok(f.local().includes(target));
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM automations").get()?.n,
    1,
  );
});

test("a busy database fails within the lock timeout", async () => {
  const f = await fixture();
  f.db.exec("BEGIN IMMEDIATE");

  try {
    await assert.rejects(deleteCodexCatalog(f.home, target, live()), /locked/);
  } finally {
    f.db.exec("ROLLBACK");
  }

  assert.ok(f.local().includes(target));
});

test("a symlinked database or journal is refused", async () => {
  const f = await fixture();
  const alternate = join(f.home, "alternate");
  await mkdir(join(alternate, "sqlite"), { recursive: true });
  await symlink(f.path, join(alternate, "sqlite", "codex-dev.db"));
  await assert.rejects(
    deleteCodexCatalog(alternate, target, live()),
    /symlink/,
  );

  const victim = join(f.home, "keep");
  await writeFile(victim, "keep");
  await symlink(victim, `${f.path}-journal`);
  await assert.rejects(deleteCodexCatalog(f.home, target, live()), /journal/);
  assert.ok(f.local().includes(target));
});
