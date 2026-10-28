import type { Dirent } from "node:fs";
import { opendir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  PAGE_SIZE,
  SEARCH_EXCLUDED_DIRECTORIES,
  directoryRequestSchema,
  fileEntrySchema,
  finishPage,
  isHiddenName,
  pageCandidates,
  searchCandidates,
  searchRequestSchema,
  searchScore,
  type DirectoryPage,
  type DirectoryRequest,
  type FileEntry,
  type FileSearchRequest,
  type FileSearchResult,
} from "./browser";

/** The file system calls the reader makes. Tests replace them. */
export interface DirectoryIO {
  canonicalize(path: string): Promise<string>;
  open(path: string): Promise<AsyncIterable<Dirent>>;
}

const directoryIO: DirectoryIO = {
  canonicalize: (path) => realpath(path),
  open: (path) => opendir(path),
};

export interface SearchLimits {
  /** Directory entries one search reads at most. */
  entries: number;
  /** Folder levels below the search folder that one search enters at most. */
  depth: number;
}

const SEARCH_LIMITS: SearchLimits = { entries: 100_000, depth: 64 };

/** Whether `path` is `root` or below it. Both must be canonical. */
export function isInside(root: string, path: string): boolean {
  const inside = relative(root, path);

  return (
    !isAbsolute(inside) && inside !== ".." && !inside.startsWith(".." + sep)
  );
}

/** Canonicalizes the root and `folder`, and rejects a folder that escapes it. */
async function workspaceFolder(
  rootPath: string,
  folder: string,
  signal: AbortSignal,
  io: DirectoryIO,
) {
  signal.throwIfAborted();
  const root = await io.canonicalize(rootPath);
  signal.throwIfAborted();
  const target = await io.canonicalize(resolve(root, folder));

  if (!isInside(root, target)) {
    throw new Error("Folder is outside the workspace.");
  }

  signal.throwIfAborted();

  return { root, target };
}

/**
 * A listable entry. Links, special files, and Git internals are not, nor are
 * hidden entries unless `showHidden` holds.
 */
function entryOf(
  entry: Dirent,
  parent: string,
  showHidden: boolean,
): FileEntry | null {
  if (
    entry.name === ".git" ||
    (!showHidden && isHiddenName(entry.name)) ||
    entry.isSymbolicLink() ||
    (!entry.isDirectory() && !entry.isFile())
  ) {
    return null;
  }

  const parsed = fileEntrySchema.safeParse({
    path: parent ? parent + "/" + entry.name : entry.name,
    kind: entry.isDirectory() ? "directory" : "file",
  });

  return parsed.success ? parsed.data : null;
}

function errorCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

const isDenied = (error: unknown) =>
  errorCode(error) === "EACCES" || errorCode(error) === "EPERM";

/**
 * Reads one page of `folder` below `rootPath`. The scan keeps at most two
 * pages of candidates in memory. Cancellation closes the directory handle.
 */
export async function readDirectory(
  rootPath: string,
  input: DirectoryRequest,
  signal: AbortSignal,
  io: DirectoryIO = directoryIO,
): Promise<DirectoryPage> {
  const { folder, showHidden, filter, after } =
    directoryRequestSchema.parse(input);
  const { target } = await workspaceFolder(rootPath, folder, signal, io);
  const needle = filter.toLowerCase();
  let candidates: FileEntry[] = [];

  for await (const dirent of await io.open(target)) {
    signal.throwIfAborted();

    if (!dirent.name.toLowerCase().includes(needle)) {
      continue;
    }

    const entry = entryOf(dirent, folder, showHidden);

    if (!entry) {
      continue;
    }

    candidates.push(entry);

    if (candidates.length > PAGE_SIZE * 2) {
      candidates = pageCandidates(candidates, after);
    }
  }

  signal.throwIfAborted();

  return finishPage(pageCandidates(candidates, after));
}

/**
 * Searches file names and paths in `folder` and its subfolders: a bounded,
 * cancellable depth-first scan. It skips `SEARCH_EXCLUDED_DIRECTORIES`,
 * follows no link, and stays inside the canonical root. Each directory
 * iterator closes on an early exit.
 */
export async function searchFiles(
  rootPath: string,
  input: FileSearchRequest,
  signal: AbortSignal,
  io: DirectoryIO = directoryIO,
  limits: SearchLimits = SEARCH_LIMITS,
): Promise<FileSearchResult> {
  const { folder, showHidden, query } = searchRequestSchema.parse(input);
  const { root, target } = await workspaceFolder(rootPath, folder, signal, io);
  let scanned = 0;
  let matches = 0;
  let limited = false;
  let candidates: FileEntry[] = [];

  async function walk(
    absolute: string,
    parent: string,
    depth: number,
  ): Promise<void> {
    signal.throwIfAborted();
    let directory: AsyncIterable<Dirent>;

    try {
      directory = await io.open(absolute);
    } catch (error) {
      if (depth > 0 && errorCode(error) === "ENOENT") {
        return;
      }

      if (depth > 0 && isDenied(error)) {
        limited = true;

        return;
      }

      throw error;
    }

    for await (const dirent of directory) {
      signal.throwIfAborted();

      if (++scanned > limits.entries) {
        limited = true;

        return;
      }

      const entry = entryOf(dirent, parent, showHidden);

      if (!entry) {
        continue;
      }

      if (entry.kind === "file") {
        if (searchScore(entry.path, folder, query) !== null) {
          matches++;
          candidates.push(entry);

          if (candidates.length > PAGE_SIZE * 2) {
            candidates = searchCandidates(candidates, folder, query);
          }
        }

        continue;
      }

      if (
        SEARCH_EXCLUDED_DIRECTORIES.has(dirent.name) ||
        SEARCH_EXCLUDED_DIRECTORIES.has(entry.path)
      ) {
        continue;
      }

      if (depth >= limits.depth) {
        limited = true;
        continue;
      }

      signal.throwIfAborted();
      let child: string;

      try {
        child = await io.canonicalize(resolve(absolute, dirent.name));
      } catch (error) {
        if (errorCode(error) === "ENOENT") {
          continue;
        }

        if (isDenied(error)) {
          limited = true;
          continue;
        }

        throw error;
      }

      signal.throwIfAborted();

      if (!isInside(root, child)) {
        continue;
      }

      await walk(child, entry.path, depth + 1);

      if (scanned > limits.entries) {
        return;
      }
    }
  }

  await walk(target, folder, 0);
  signal.throwIfAborted();

  return {
    entries: searchCandidates(candidates, folder, query),
    truncated: matches > PAGE_SIZE,
    limited,
  };
}
