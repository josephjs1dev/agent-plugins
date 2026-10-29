import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { nativeSessionSchema } from "./contracts";
import { lstatOrNull, realpathOrNull } from "./fs";

const execFileAsync = promisify(execFile);
const resultSchema = z.union([
  z.object({ removed: z.int().min(0) }),
  z.object({ error: z.string() }),
]);

// Python's standard-library SQLite avoids a native addon in the host bundle.
// It matches the desktop app's own removal, including scan tombstones, and
// refuses any schema, trigger, or foreign key it does not expect.
const REMOVE_CATALOG_ENTRY = String.raw`
import json, pathlib, sqlite3, sys

db = None
try:
    db = sqlite3.connect(pathlib.Path(sys.argv[1]).as_uri() + "?mode=rw", uri=True, timeout=1, isolation_level=None)
    db.execute("PRAGMA trusted_schema = OFF")
    db.execute("BEGIN IMMEDIATE")
    required = {
        "local_thread_catalog": {"host_id": ("TEXT", 1), "thread_id": ("TEXT", 2), "missing_candidate": ("INTEGER", 0)},
        "local_thread_catalog_hosts": {"host_id": ("TEXT", 1), "host_kind": ("TEXT", 0)},
        "local_thread_catalog_sync_state": {"host_id": ("TEXT", 1), "observation_sequence": ("INTEGER", 0)},
        "local_thread_catalog_metadata": {"id": ("INTEGER", 1), "catalog_revision": ("INTEGER", 0)},
        "local_thread_catalog_scan_entries": {"host_id": ("TEXT", 1), "thread_id": ("TEXT", 2), "removed": ("INTEGER", 0)},
    }
    for table, expected in required.items():
        kind = db.execute("SELECT type FROM sqlite_master WHERE name = ?", (table,)).fetchone()
        columns = {r[1]: (r[2].upper(), r[5]) for r in db.execute('PRAGMA table_info("' + table + '")')}
        keys = {name for name, (_, pk) in columns.items() if pk}
        expected_keys = {name for name, (_, pk) in expected.items() if pk}
        if kind != ("table",) or keys != expected_keys or any(columns.get(name) != spec for name, spec in expected.items()):
            raise ValueError("Unsupported Codex desktop catalog schema: " + table)
        if db.execute("SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ?", (table,)).fetchone():
            raise ValueError("Unsupported Codex desktop catalog triggers: " + table)
        if db.execute('PRAGMA foreign_key_list("' + table + '")').fetchone():
            raise ValueError("Unsupported Codex desktop catalog foreign keys: " + table)
    # A new child table with CASCADE could otherwise change unrelated app state.
    for (table,) in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall():
        quoted = table.replace('"', '""')
        if any(row[2].lower() in required for row in db.execute('PRAGMA foreign_key_list("' + quoted + '")')):
            raise ValueError("Unsupported Codex desktop catalog foreign key references: " + table)

    session = sys.argv[2]
    rows = db.execute('''SELECT catalog.host_id, catalog.missing_candidate
        FROM local_thread_catalog AS catalog
        JOIN local_thread_catalog_hosts AS hosts ON hosts.host_id = catalog.host_id
        WHERE hosts.host_kind = 'local' AND catalog.thread_id = ?''', (session,)).fetchall()
    revision = db.execute("SELECT catalog_revision FROM local_thread_catalog_metadata WHERE id = 1").fetchone()
    if not revision or type(revision[0]) is not int:
        raise ValueError("Unsupported Codex desktop catalog revision")
    for host, missing in rows:
        sequence = db.execute("SELECT observation_sequence FROM local_thread_catalog_sync_state WHERE host_id = ?", (host,)).fetchone()
        if not sequence or type(sequence[0]) is not int or missing not in (0, 1):
            raise ValueError("Unsupported Codex desktop catalog sync state")
        db.execute("UPDATE local_thread_catalog_sync_state SET observation_sequence = observation_sequence + 1 WHERE host_id = ?", (host,))
        # Always record removal: a live scan may exist only in the app's memory,
        # before its first persisted checkpoint. A later fresh scan clears it.
        db.execute('''INSERT INTO local_thread_catalog_scan_entries (host_id, thread_id, removed)
            VALUES (?, ?, 1) ON CONFLICT(host_id, thread_id) DO UPDATE SET removed = 1''', (host, session))
        db.execute("DELETE FROM local_thread_catalog WHERE host_id = ? AND thread_id = ?", (host, session))
    if any(missing == 0 for _, missing in rows):
        db.execute("UPDATE local_thread_catalog_metadata SET catalog_revision = catalog_revision + 1 WHERE id = 1")
    db.execute("COMMIT")
    print(json.dumps({"removed": len(rows)}))
except Exception as error:
    if db is not None and db.in_transaction:
        db.execute("ROLLBACK")
    print(json.dumps({"error": str(error)}))
finally:
    if db is not None:
        db.close()
`;

/** `<home>/sqlite/codex-dev.db`, or null when it is absent. Refuses symlinks at every level. */
async function catalogPath(home: string): Promise<string | null> {
  const base = await realpathOrNull(home);

  if (!base) {
    return null;
  }

  const directory = join(base, "sqlite");
  const database = join(directory, "codex-dev.db");

  for (const [path, isDirectory] of [
    [directory, true],
    [database, false],
  ] as const) {
    const stat = await lstatOrNull(path);

    if (!stat) {
      return null;
    }

    if (stat.isSymbolicLink()) {
      throw new Error("Refusing a symlink in Codex desktop catalog data.");
    }

    if (isDirectory ? !stat.isDirectory() : !stat.isFile()) {
      throw new Error("Invalid Codex desktop catalog path.");
    }
  }

  // SQLite writes these companions too: never allow a linked WAL or SHM.
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    const stat = await lstatOrNull(database + suffix);

    if (stat && (!stat.isFile() || stat.isSymbolicLink())) {
      throw new Error("Refusing a linked Codex catalog journal.");
    }
  }

  return database;
}

export interface CatalogOptions {
  /** The Python 3 interpreter that runs the SQLite transaction. */
  python?: string;
}

/**
 * Removes one session's local entry from the Codex desktop app's sidebar
 * catalog in `<home>/sqlite/codex-dev.db`, in one transaction that also
 * bumps the scan bookkeeping and the catalog revision. Call it only for an
 * exact recorded session, after Codex confirmed native deletion. A missing
 * database removes nothing. A running app may keep the entry in memory until
 * it reopens.
 */
export async function deleteCodexCatalog(
  home: string,
  id: string,
  signal: AbortSignal,
  { python = "python3" }: CatalogOptions = {},
): Promise<{ removed: number }> {
  nativeSessionSchema.shape.id.parse(id);
  signal.throwIfAborted();
  const path = await catalogPath(home);

  if (!path) {
    return { removed: 0 };
  }

  signal.throwIfAborted();
  const { stdout } = await execFileAsync(
    python,
    ["-I", "-c", REMOVE_CATALOG_ENTRY, path, id],
    { signal, timeout: 5000, killSignal: "SIGKILL", maxBuffer: 16 * 1024 },
  );
  const result = resultSchema.parse(JSON.parse(stdout));

  if ("error" in result) {
    throw new Error(result.error);
  }

  return result;
}
