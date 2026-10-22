import {
  lstatSync,
  mkdirSync,
  renameSync,
  rmdirSync,
  symlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** The host-independent Conductor data directory: `$CONDUCTOR_HOME` or `~/.conductor`. */
export function conductorHome(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): string {
  return env.CONDUCTOR_HOME?.trim() || join(home, ".conductor");
}

/**
 * Move a host's legacy data directory to `target` once, then leave a symlink at
 * the legacy path so running task agents keep reaching their command launcher.
 * Returns the directory to use: `target`, or `legacy` when the move fails.
 */
export function adoptLegacyHome(target: string, legacy: string): string {
  if (kind(target) !== "missing" || kind(legacy) !== "directory") {
    return target;
  }
  try {
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    renameSync(legacy, target);
  } catch (error) {
    console.error(
      `Conductor kept ${legacy}; moving it to ${target} failed.`,
      error,
    );
    return legacy;
  }
  try {
    symlinkSync(target, legacy, "dir");
  } catch (error) {
    console.error(`Conductor could not link ${legacy} to ${target}.`, error);
  }
  return target;
}

/** A host directory's entries; the worker profile store stays shared in the home. */
const HOST_ENTRIES = [
  "symphonies",
  "artifacts",
  "symphony-write-lock",
  "receipts",
  "annotations",
  "recent.json",
  "turns",
  "agent-commands",
  "command.mjs",
];
/** The launcher paths that running task agents hold. */
const LAUNCHER_ENTRIES = ["command.mjs", "agent-commands", "commands.sock"];

/**
 * Move a host's entries from the shared `home` to `target` once, then leave
 * symlinks at the home's launcher paths so running task agents keep reaching
 * their commands. An earlier layout kept one host's data in the home itself.
 * Returns the directory to use: `target`, or `home` when the move fails.
 */
export function adoptHostDirectory(home: string, target: string): string {
  const entries = HOST_ENTRIES.filter(
    (name) => kind(join(home, name)) !== "missing",
  );
  if (kind(target) !== "missing" || entries.length === 0) {
    return target;
  }
  const moved: string[] = [];
  try {
    mkdirSync(target, { recursive: true, mode: 0o700 });
    for (const name of entries) {
      renameSync(join(home, name), join(target, name));
      moved.push(name);
    }
  } catch (error) {
    console.error(
      `Conductor kept ${home}; moving it to ${target} failed.`,
      error,
    );
    try {
      for (const name of moved.reverse()) {
        renameSync(join(target, name), join(home, name));
      }
      // An empty target lets the next start retry the move.
      if (kind(target) === "directory") {
        rmdirSync(target);
      }
    } catch (restore) {
      console.error(`Conductor could not restore ${home}.`, restore);
    }
    return home;
  }
  for (const name of LAUNCHER_ENTRIES) {
    // A stale socket from a crashed process keeps its path.
    if (kind(join(home, name)) !== "missing") {
      continue;
    }
    try {
      symlinkSync(join(target, name), join(home, name));
    } catch (error) {
      console.error(`Conductor could not link ${join(home, name)}.`, error);
    }
  }
  return target;
}

function kind(path: string): "missing" | "directory" | "other" {
  try {
    return lstatSync(path).isDirectory() ? "directory" : "other";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "missing";
    }
    throw error;
  }
}
