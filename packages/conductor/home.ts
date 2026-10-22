import { lstatSync, mkdirSync, renameSync, symlinkSync } from "node:fs";
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
