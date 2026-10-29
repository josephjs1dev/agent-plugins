import type { Dirent } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { nativeSessionSchema } from "./contracts";
import { lstatOrNull, realpathOrNull } from "./fs";

const MAX_PROJECTS = 20_000;
const MAX_TODOS = 50_000;

/** Per-session paths outside `projects/` and `todos/`, relative to the config directory. */
function sessionPaths(id: string): string[] {
  return [
    join("tasks", id),
    join("file-history", id),
    join("session-env", id),
    join("debug", `${id}.txt`),
  ];
}

function isSessionTodo(id: string, file: string): boolean {
  return (
    file === `${id}.json` ||
    (file.startsWith(`${id}-agent-`) && file.endsWith(".json"))
  );
}

/** Removes `root/relative`. Never follows a symlink below `root`, including intermediate folders. */
async function removeContained(
  root: string,
  relative: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const target = resolve(root, relative);

  if (!target.startsWith(`${root}${sep}`)) {
    throw new Error("Session path escapes provider data.");
  }

  let path = root;

  for (const part of target.slice(root.length + 1).split(sep)) {
    path = join(path, part);
    const stat = await lstatOrNull(path);

    if (!stat) {
      return;
    }

    if (stat.isSymbolicLink()) {
      throw new Error("Refusing a symlink in Claude session data.");
    }
  }

  signal.throwIfAborted();
  await rm(target, { recursive: true, force: true });
}

/** Lists a config subfolder. A missing folder is empty. A symlinked folder or an unbounded scan is refused. */
async function listFolder(
  path: string,
  label: string,
  limit: number,
): Promise<Dirent[]> {
  const stat = await lstatOrNull(path);

  if (!stat) {
    return [];
  }

  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing a symlinked Claude ${label} folder.`);
  }

  const entries = await readdir(path, { withFileTypes: true });

  if (entries.length > limit) {
    throw new Error(
      `Claude ${label} scan exceeds ${limit.toLocaleString("en-US")} entries.`,
    );
  }

  return entries;
}

/**
 * Deletes one Claude Code session: its transcript and subagent folder in
 * every project, plus its tasks, file history, session environment, debug
 * log, and todos. A missing config directory or file counts as deleted.
 */
export async function deleteClaudeSession(
  home: string,
  id: string,
  signal: AbortSignal,
): Promise<void> {
  nativeSessionSchema.shape.id.parse(id);
  signal.throwIfAborted();
  const base = await realpathOrNull(home);

  if (!base) {
    return;
  }

  const projects = join(base, "projects");

  for (const folder of await listFolder(projects, "projects", MAX_PROJECTS)) {
    signal.throwIfAborted();

    // A linked folder could hold this session: refuse instead of reporting success.
    if (folder.isSymbolicLink()) {
      throw new Error("Refusing a symlinked Claude project folder.");
    }

    if (!folder.isDirectory()) {
      continue;
    }

    await removeContained(
      base,
      join("projects", folder.name, `${id}.jsonl`),
      signal,
    );
    await removeContained(base, join("projects", folder.name, id), signal);
  }

  for (const path of sessionPaths(id)) {
    await removeContained(base, path, signal);
  }

  for (const todo of await listFolder(
    join(base, "todos"),
    "todos",
    MAX_TODOS,
  )) {
    if (isSessionTodo(id, todo.name)) {
      await removeContained(base, join("todos", todo.name), signal);
    }
  }
}
