import { lstat, realpath, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileEntrySchema, type FileEntry } from "./browser";
import { isInside } from "./reader";

/**
 * Permanently deletes a file, or a folder and its contents, below
 * `rootPath`. The entry's parent must canonicalize inside the root, and the
 * entry itself must still be the confirmed kind and not a symlink, so a
 * change after the user confirmed fails instead of deleting something else.
 * The recursive delete removes links inside a folder, never their targets.
 */
export async function deleteEntry(
  rootPath: string,
  input: FileEntry,
  signal: AbortSignal,
): Promise<{ path: string }> {
  const { path, kind } = fileEntrySchema.parse(input);
  signal.throwIfAborted();
  const root = await realpath(rootPath);
  const parent = await realpath(resolve(root, dirname(path)));

  if (!isInside(root, parent)) {
    throw new Error("The entry is outside the workspace.");
  }

  const target = join(parent, basename(path));
  let stats;

  try {
    stats = await lstat(target);
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "ENOENT") {
      throw new Error("The entry no longer exists. Refresh the Explorer.", {
        cause: error,
      });
    }

    throw error;
  }

  const matches = kind === "directory" ? stats.isDirectory() : stats.isFile();

  if (stats.isSymbolicLink() || !matches) {
    throw new Error("The entry changed. Refresh the Explorer and try again.");
  }

  signal.throwIfAborted();
  await rm(target, { recursive: kind === "directory" });

  return { path };
}
