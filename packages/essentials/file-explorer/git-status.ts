import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { promisify } from "node:util";
import { parsePorcelain, type GitStatusResult } from "./git";

const execFileAsync = promisify(execFile);

/** Runs `git` with `args` in `cwd` and returns its stdout. Tests replace it. */
export type RunGit = (
  args: readonly string[],
  cwd: string,
  signal: AbortSignal,
) => Promise<string>;

/** Status output above this size fails instead of filling memory. */
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

const runGit: RunGit = async (args, cwd, signal) => {
  const { stdout } = await execFileAsync("git", [...args], {
    cwd,
    signal,
    encoding: "utf8",
    maxBuffer: MAX_OUTPUT_BYTES,
    windowsHide: true,
    // A read-only status must not take the index lock an agent may need.
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  });

  return stdout;
};

/**
 * Reads the Git status of the workspace at `rootPath`: changed, untracked,
 * and ignored paths, relative to the workspace. Untracked and ignored
 * folders come back once, not file by file. A workspace outside a Git work
 * tree returns `repository: false`.
 */
export async function readGitStatus(
  rootPath: string,
  signal: AbortSignal,
  run: RunGit = runGit,
): Promise<GitStatusResult> {
  signal.throwIfAborted();
  const root = await realpath(rootPath);
  let prefix: string;

  try {
    prefix = (await run(["rev-parse", "--show-prefix"], root, signal)).trim();
  } catch (error) {
    signal.throwIfAborted();

    if (error instanceof Error && "code" in error && error.code === 128) {
      return { repository: false, entries: [], truncated: false };
    }

    throw new Error("Could not read the Git status.", { cause: error });
  }

  let output: string;

  try {
    output = await run(
      [
        "status",
        "--porcelain=v1",
        "-z",
        "--no-renames",
        "--untracked-files=normal",
        "--ignored=traditional",
        "--",
        ".",
      ],
      root,
      signal,
    );
  } catch (error) {
    signal.throwIfAborted();
    throw new Error("Could not read the Git status.", { cause: error });
  }

  return parsePorcelain(output, prefix);
}
