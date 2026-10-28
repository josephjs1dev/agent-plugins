import { z } from "zod";
import { relativeFilePath, type FileEntry } from "./browser";

/** The most status entries one read returns. */
export const MAX_GIT_ENTRIES = 20_000;

export const gitStatusSchema = z.enum([
  "conflicted",
  "modified",
  "deleted",
  "added",
  "untracked",
  "ignored",
]);
export type GitStatus = z.infer<typeof gitStatusSchema>;

export const gitEntrySchema = z.object({
  path: relativeFilePath,
  status: gitStatusSchema,
  /** Git reports an untracked or ignored folder once, for all its contents. */
  directory: z.boolean(),
});
export type GitEntry = z.infer<typeof gitEntrySchema>;

export const gitStatusResultSchema = z.object({
  /** The workspace is inside a Git work tree. */
  repository: z.boolean(),
  entries: z.array(gitEntrySchema).max(MAX_GIT_ENTRIES),
  /** Git reported more than `MAX_GIT_ENTRIES` entries. */
  truncated: z.boolean(),
});
export type GitStatusResult = z.infer<typeof gitStatusResultSchema>;

const CONFLICTS = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

/** The status of one `git status --porcelain` XY code. */
export function statusOfCode(code: string): GitStatus {
  if (code === "??") {
    return "untracked";
  }

  if (code === "!!") {
    return "ignored";
  }

  if (CONFLICTS.has(code)) {
    return "conflicted";
  }

  if (code.includes("D")) {
    return "deleted";
  }

  return code[0] === "A" ? "added" : "modified";
}

/**
 * Parses `git status --porcelain=v1 -z --no-renames` output. Paths are
 * relative to the repository root, so `prefix` (the workspace's path inside
 * the repository, as `git rev-parse --show-prefix` prints it) is removed, and
 * entries outside the workspace are dropped. So are paths the Explorer
 * cannot show.
 */
export function parsePorcelain(
  output: string,
  prefix: string,
): GitStatusResult {
  const entries: GitEntry[] = [];
  let truncated = false;

  for (const record of output.split("\0")) {
    if (record.length < 4 || record[2] !== " ") {
      continue;
    }

    const raw = record.slice(3);

    if (!raw.startsWith(prefix)) {
      continue;
    }

    const directory = raw.endsWith("/");
    const parsed = gitEntrySchema.safeParse({
      path: raw.slice(prefix.length, directory ? -1 : undefined),
      status: statusOfCode(record.slice(0, 2)),
      directory,
    });

    if (!parsed.success) {
      continue;
    }

    if (entries.length === MAX_GIT_ENTRIES) {
      truncated = true;
      break;
    }

    entries.push(parsed.data);
  }

  return { repository: true, entries, truncated };
}

/** Higher wins when a folder holds several changes. */
const PRIORITY: Record<GitStatus, number> = {
  conflicted: 5,
  modified: 4,
  deleted: 3,
  added: 2,
  untracked: 1,
  ignored: 0,
};

export interface GitIndex {
  /** Files with their own status. */
  files: ReadonlyMap<string, GitStatus>;
  /** Untracked or ignored folders: every path below shares the status. */
  trees: ReadonlyMap<string, GitStatus>;
  /** Folders holding a change: the highest status below them. */
  folders: ReadonlyMap<string, GitStatus>;
}

const parentsOf = (path: string) => {
  const parts = path.split("/");

  return parts.slice(1).map((_, index) => parts.slice(0, index + 1).join("/"));
};

export function indexGitStatus(entries: readonly GitEntry[]): GitIndex {
  const files = new Map<string, GitStatus>();
  const trees = new Map<string, GitStatus>();
  const folders = new Map<string, GitStatus>();

  for (const { path, status, directory } of entries) {
    (directory ? trees : files).set(path, status);

    if (status === "ignored") {
      continue;
    }

    for (const folder of parentsOf(path)) {
      const current = folders.get(folder);

      if (!current || PRIORITY[status] > PRIORITY[current]) {
        folders.set(folder, status);
      }
    }
  }

  return { files, trees, folders };
}

/**
 * The status to show for `entry`: from an untracked or ignored folder that
 * holds it, then its own, then, for a folder, the highest change below it.
 * Null for a clean entry.
 */
export function gitStatusOf(
  index: GitIndex,
  { path, kind }: FileEntry,
): GitStatus | null {
  for (const folder of [...parentsOf(path), path]) {
    const status = index.trees.get(folder);

    if (status) {
      return status;
    }
  }

  return (
    index.files.get(path) ??
    (kind === "directory" ? index.folders.get(path) : undefined) ??
    null
  );
}
