import { z } from "zod";

/** Entries per directory page, and the most search results one request returns. */
export const PAGE_SIZE = 200;

/**
 * A path relative to the workspace root. It has no empty, `.`, `..`, or
 * `.git` segment, no backslash, no control character, and no lone surrogate.
 */
export const relativeFilePath = z
  .string()
  .min(1)
  .max(4096)
  .refine(
    (path) =>
      path.trim() === path &&
      !path.includes("\\") &&
      Array.from(path).every((character) => {
        const code = character.codePointAt(0) ?? 0;

        return code >= 32 && !(code >= 0xd800 && code <= 0xdfff);
      }) &&
      path
        .split("/")
        .every(
          (part) =>
            part !== "" && part !== "." && part !== ".." && part !== ".git",
        ),
    "Expected a workspace-relative path",
  );

export const fileEntrySchema = z.object({
  path: relativeFilePath,
  kind: z.enum(["file", "directory"]),
});
export type FileEntry = z.infer<typeof fileEntrySchema>;

/** The workspace root is the empty folder. */
export const folderSchema = z.union([z.literal(""), relativeFilePath]);

/** Lists entries whose name starts with a dot. Hiding one hides its contents. */
const showHiddenSchema = z.boolean();

/**
 * Lists entries that Git ignores. A tracked file is never ignored, and
 * nothing is ignored outside a Git work tree.
 */
const showIgnoredSchema = z.boolean();

/** A dotfile or dot-folder, such as `.env` or `.github`. */
export const isHiddenName = (name: string) => name.startsWith(".");

/** Whether a segment of `path`, relative to the root, is hidden. */
export const isHiddenPath = (path: string) =>
  path.split("/").some(isHiddenName);

export const directoryRequestSchema = z
  .object({
    folder: folderSchema,
    showHidden: showHiddenSchema,
    showIgnored: showIgnoredSchema,
    /** Keeps entries whose name contains this text, case-insensitively. */
    filter: z.string().max(200),
    /** The last entry of the previous page, or null for the first page. */
    after: fileEntrySchema.nullable(),
  })
  .strict();
export type DirectoryRequest = z.infer<typeof directoryRequestSchema>;

export const directoryPageSchema = z.object({
  entries: z.array(fileEntrySchema).max(PAGE_SIZE),
  next: fileEntrySchema.nullable(),
});
export type DirectoryPage = z.infer<typeof directoryPageSchema>;

/** Directories first, then by path in code-unit order. */
export function compareEntries(a: FileEntry, b: FileEntry): number {
  return (
    Number(b.kind === "directory") - Number(a.kind === "directory") ||
    comparePaths(a.path, b.path)
  );
}

function comparePaths(a: string, b: string): number {
  if (a < b) {
    return -1;
  }

  return a > b ? 1 : 0;
}

/** Keeps only the next page and one lookahead entry during a directory scan. */
export function pageCandidates(
  entries: readonly FileEntry[],
  after: FileEntry | null,
): FileEntry[] {
  return entries
    .filter((entry) => !after || compareEntries(entry, after) > 0)
    .sort(compareEntries)
    .slice(0, PAGE_SIZE + 1);
}

export function finishPage(candidates: readonly FileEntry[]): DirectoryPage {
  const entries = candidates.slice(0, PAGE_SIZE);

  return {
    entries,
    next: candidates.length > PAGE_SIZE ? (entries.at(-1) ?? null) : null,
  };
}

/** The folder that holds `path`; the root is "". */
export function parentFolder(path: string): string {
  if (!path) {
    return "";
  }

  return relativeFilePath.parse(path).split("/").slice(0, -1).join("/");
}

export const searchRequestSchema = z
  .object({
    folder: folderSchema,
    showHidden: showHiddenSchema,
    showIgnored: showIgnoredSchema,
    query: z.string().trim().min(1).max(200),
  })
  .strict();
export type FileSearchRequest = z.infer<typeof searchRequestSchema>;

export const searchResultSchema = z.object({
  entries: z.array(fileEntrySchema).max(PAGE_SIZE),
  /** More files matched than `entries` holds. */
  truncated: z.boolean(),
  /** The deadline or an unreadable folder left the scan incomplete. */
  limited: z.boolean(),
});
export type FileSearchResult = z.infer<typeof searchResultSchema>;

/**
 * Scores `path` when it is inside `folder` and every query word appears in
 * its path below `folder`, case-insensitively; null otherwise. Filename
 * matches score higher than path-only matches.
 */
export function searchScore(
  path: string,
  folder: string,
  query: string,
): number | null {
  if (folder && !path.startsWith(folder + "/")) {
    return null;
  }

  const scoped = (folder ? path.slice(folder.length + 1) : path).toLowerCase();
  const name = scoped.split("/").at(-1) ?? scoped;
  const words = query.toLowerCase().replaceAll("\\", "/").trim().split(/\s+/);

  if (!words.every((word) => scoped.includes(word))) {
    return null;
  }

  return words.reduce((score, word) => score + wordScore(name, word), 0);
}

function wordScore(name: string, word: string): number {
  if (name === word) {
    return 400;
  }

  if (name.startsWith(word)) {
    return 200;
  }

  return name.includes(word) ? 100 : 10;
}

/** The best `PAGE_SIZE` matches, highest score first, then by path. */
export function searchCandidates(
  entries: readonly FileEntry[],
  folder: string,
  query: string,
): FileEntry[] {
  return entries
    .flatMap((entry) => {
      const score = searchScore(entry.path, folder, query);

      return score === null ? [] : [{ entry, score }];
    })
    .sort(
      (a, b) => b.score - a.score || comparePaths(a.entry.path, b.entry.path),
    )
    .slice(0, PAGE_SIZE)
    .map(({ entry }) => entry);
}

/**
 * Dependency and cache folders that search skips. The tree still lists them.
 * An entry with a slash matches the path from the workspace root.
 */
export const SEARCH_EXCLUDED_DIRECTORIES: ReadonlySet<string> = new Set([
  ".git",
  "node_modules",
  ".pnpm-store",
  ".venv",
  "venv",
  "__pycache__",
  ".cache",
  ".next",
  ".turbo",
  ".claude/worktrees",
]);

/**
 * Whether a folder of `path` below `folder` is one that search skips. Both
 * paths are relative to the workspace root.
 */
export function isSearchExcluded(path: string, folder: string): boolean {
  const folders = path.split("/").slice(0, -1);
  const below = folder ? folder.split("/").length : 0;

  return folders.some(
    (name, index) =>
      index >= below &&
      (SEARCH_EXCLUDED_DIRECTORIES.has(name) ||
        SEARCH_EXCLUDED_DIRECTORIES.has(folders.slice(0, index + 1).join("/"))),
  );
}

/**
 * The `rg --files` arguments of a filename search. The `!` globs prune the
 * `SEARCH_EXCLUDED_DIRECTORIES` below the searched folder.
 */
export function ripgrepFileArgs(request: FileSearchRequest): string[] {
  const args = ["--files", "--null", "--no-config"];

  if (request.showHidden) {
    args.push("--hidden");
  }

  if (request.showIgnored) {
    args.push("--no-ignore");
  }

  for (const directory of SEARCH_EXCLUDED_DIRECTORIES) {
    args.push("--glob", "!" + directory);
  }

  args.push("--");

  if (request.folder) {
    args.push(request.folder);
  }

  return args;
}
