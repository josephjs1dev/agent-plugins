import { lstatSync, mkdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** The host-independent Essentials data directory: `$ESSENTIALS_HOME` or `~/.essentials`. */
export function essentialsHome(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): string {
  return env.ESSENTIALS_HOME?.trim() || join(home, ".essentials");
}

/**
 * Move a host's legacy data directory to `target` once.
 * Returns the directory to use: `target`, or `legacy` when the move fails.
 */
export function adoptLegacyDirectory(target: string, legacy: string): string {
  if (kind(target) !== "missing" || kind(legacy) !== "directory") {
    return target;
  }

  try {
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    renameSync(legacy, target);
  } catch (error) {
    console.error(
      `Essentials kept ${legacy}; moving it to ${target} failed.`,
      error,
    );

    return legacy;
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
