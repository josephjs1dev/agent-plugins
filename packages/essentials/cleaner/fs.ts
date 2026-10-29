import { lstat, realpath } from "node:fs/promises";

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

/** `lstat`, or null for a missing path. It never follows the final symlink. */
export async function lstatOrNull(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if (isMissing(error)) {
      return null;
    }

    throw error;
  }
}

/** `realpath`, or null for a missing path. */
export async function realpathOrNull(path: string) {
  try {
    return await realpath(path);
  } catch (error) {
    if (isMissing(error)) {
      return null;
    }

    throw error;
  }
}
