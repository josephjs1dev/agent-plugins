import type { Dirent } from "node:fs";
import { opendir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  PAGE_SIZE,
  directoryRequestSchema,
  fileEntrySchema,
  finishPage,
  isHiddenName,
  isHiddenPath,
  isSearchExcluded,
  pageCandidates,
  ripgrepFileArgs,
  searchCandidates,
  searchRequestSchema,
  searchScore,
  type DirectoryPage,
  type DirectoryRequest,
  type FileEntry,
  type FileSearchRequest,
  type FileSearchResult,
} from "./browser";
import { gitIgnoreRules, type IgnoreRules } from "./ignored";
import { runRipgrep, type RipgrepOptions } from "./ripgrep";

/** The file system calls the reader makes. Tests replace them. */
export interface DirectoryIO {
  canonicalize(path: string): Promise<string>;
  open(path: string): Promise<AsyncIterable<Dirent>>;
}

const directoryIO: DirectoryIO = {
  canonicalize: (path) => realpath(path),
  open: (path) => opendir(path),
};

const GIT_IGNORE_RULES = gitIgnoreRules();

const nameOf = (entry: FileEntry) => entry.path.split("/").at(-1) ?? "";

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

/**
 * Reads one page of `folder` below `rootPath`. The scan keeps at most two
 * pages of candidates in memory. Without `showIgnored`, it drops the entries
 * Git ignores before it builds the page, so they take no page slots.
 * Cancellation closes the directory handle.
 */
export async function readDirectory(
  rootPath: string,
  input: DirectoryRequest,
  signal: AbortSignal,
  io: DirectoryIO = directoryIO,
  ignore: IgnoreRules = GIT_IGNORE_RULES,
): Promise<DirectoryPage> {
  const { folder, showHidden, showIgnored, filter, after } =
    directoryRequestSchema.parse(input);
  const { target } = await workspaceFolder(rootPath, folder, signal, io);
  const needle = filter.toLowerCase();
  let candidates: FileEntry[] = [];
  let batch: FileEntry[] = [];
  const flush = async () => {
    const ignored = showIgnored
      ? new Set<string>()
      : await ignore.names(target, batch.map(nameOf), signal);
    candidates = pageCandidates(
      [...candidates, ...batch.filter((entry) => !ignored.has(nameOf(entry)))],
      after,
    );
    batch = [];
  };

  for await (const dirent of await io.open(target)) {
    signal.throwIfAborted();

    if (!dirent.name.toLowerCase().includes(needle)) {
      continue;
    }

    const entry = entryOf(dirent, folder, showHidden);

    if (!entry) {
      continue;
    }

    batch.push(entry);

    if (batch.length > PAGE_SIZE * 2) {
      await flush();
    }
  }

  signal.throwIfAborted();
  await flush();

  return finishPage(candidates);
}

export interface FileSearchOptions extends RipgrepOptions {
  /** Git's ignore rules. Tests replace them. */
  ignore?: IgnoreRules;
}

/** A path record above this size stops the search as limited. */
const MAX_PATH_CHARS = 64 * 1024;

/**
 * Searches file names and paths in `folder` and its subfolders. `rg --files`
 * lists the files under a deadline, with no entry or depth limit. It skips
 * `SEARCH_EXCLUDED_DIRECTORIES`, follows no link, and stays inside the
 * canonical root. Without `showIgnored`, ripgrep follows the ignore rules, and
 * one Git read adds the tracked files that match them. The deadline or an
 * unreadable folder returns the partial result.
 */
export async function searchFiles(
  rootPath: string,
  input: FileSearchRequest,
  signal: AbortSignal,
  { ignore = GIT_IGNORE_RULES, ...options }: FileSearchOptions = {},
): Promise<FileSearchResult> {
  const request = searchRequestSchema.parse(input);
  const { folder, showHidden, showIgnored, query } = request;
  const { root, target } = await workspaceFolder(
    rootPath,
    folder,
    signal,
    directoryIO,
  );
  let matches = 0;
  let candidates: FileEntry[] = [];
  // Sorting puts a path that both ripgrep and Git list next to its duplicate.
  const best = () =>
    searchCandidates(candidates, folder, query).filter(
      (entry, index, all) => entry.path !== all[index - 1]?.path,
    );
  const add = (path: string) => {
    const parsed = fileEntrySchema.safeParse({ path, kind: "file" });

    if (parsed.success && searchScore(path, folder, query) !== null) {
      matches++;
      candidates.push(parsed.data);

      if (candidates.length > PAGE_SIZE * 2) {
        candidates = best();
      }
    }

    return true;
  };

  // ripgrep lists a folder named on its command line even when Git ignores it.
  const folderIgnored =
    !showIgnored &&
    folder !== "" &&
    (await ignore.names(root, [folder], signal)).has(folder);
  // A failed Git read stops ripgrep instead of leaving it to the deadline.
  const failed = new AbortController();
  const scan = AbortSignal.any([signal, failed.signal]);
  const [listed, tracked] = await Promise.all([
    folderIgnored
      ? { code: 1, stderr: "", stopped: false, limited: false }
      : runRipgrep(
          root,
          ripgrepFileArgs(request),
          scan,
          "\0",
          add,
          options,
          MAX_PATH_CHARS,
        ),
    showIgnored
      ? []
      : ignore.trackedPaths(target, signal).catch((error: unknown) => {
          failed.abort();
          throw error;
        }),
  ]);
  signal.throwIfAborted();

  for (const path of tracked) {
    const scoped = folder ? folder + "/" + path : path;

    if (
      !isSearchExcluded(scoped, folder) &&
      (showHidden || !isHiddenPath(path))
    ) {
      add(scoped);
    }
  }

  const { code, stderr, stopped, limited } = listed;

  // ripgrep exits 1 when it lists nothing, and 2 after an unreadable folder
  // or when the globs leave nothing to list.
  if (!stopped && code !== 0 && code !== 1 && code !== 2) {
    throw new Error(`ripgrep exited with code ${String(code)}.`);
  }

  return {
    entries: best(),
    truncated: matches > PAGE_SIZE,
    limited: stopped
      ? limited
      : code === 2 && !stderr.includes("No files were searched"),
  };
}
