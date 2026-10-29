import { runGit, type RunGit } from "./git-status";

const IGNORE_RULES_FAILED =
  "Git could not read the ignore rules. Show ignored files to browse without them.";

/** The Git ignore lookups that the reader makes. Tests replace them. */
export interface IgnoreRules {
  /** The `names` in the canonical `folder` that Git ignores. */
  names(
    folder: string,
    names: readonly string[],
    signal: AbortSignal,
  ): Promise<ReadonlySet<string>>;
  /**
   * The paths below the canonical `folder`, relative to it, that Git
   * ignores. A folder whose untracked contents are all ignored appears once.
   * `.` means that nothing below `folder` is visible.
   */
  paths(folder: string, signal: AbortSignal): Promise<ReadonlySet<string>>;
}

const exitCode = (error: unknown) => (error as { code?: unknown } | null)?.code;

const outsideRepository = (error: unknown) =>
  exitCode(error) === 128 &&
  String((error as { stderr?: unknown }).stderr).includes(
    "not a git repository",
  );

/**
 * Git's ignore rules, read on the host that owns the checkout. A tracked
 * file is never ignored, and nothing is ignored outside a Git work tree. A
 * failed read throws a generic error, never Git's output.
 */
export function gitIgnoreRules(run: RunGit = runGit): IgnoreRules {
  return {
    async names(folder, names, signal) {
      if (names.length === 0) {
        return new Set();
      }

      let output: string;

      try {
        // A "./" prefix keeps a leading ":" from reading as pathspec magic.
        output = await run(
          ["check-ignore", "--stdin", "-z"],
          folder,
          signal,
          names.map((name) => `./${name}\0`).join(""),
        );
      } catch (error) {
        signal.throwIfAborted();

        // check-ignore exits 1 when it ignores none of the names.
        if (exitCode(error) === 1 || outsideRepository(error)) {
          return new Set();
        }

        throw new Error(IGNORE_RULES_FAILED, { cause: error });
      }

      return new Set(
        output
          .split("\0")
          .filter(Boolean)
          .map((path) => path.replace(/^\.\//, "")),
      );
    },
    async paths(folder, signal) {
      let output: string;

      try {
        output = await run(
          [
            "ls-files",
            "-z",
            "--others",
            "--ignored",
            "--exclude-standard",
            "--directory",
          ],
          folder,
          signal,
        );
      } catch (error) {
        signal.throwIfAborted();

        if (outsideRepository(error)) {
          return new Set();
        }

        throw new Error(IGNORE_RULES_FAILED, { cause: error });
      }

      return new Set(
        output
          .split("\0")
          .filter(Boolean)
          .map((path) => (path === "./" ? "." : path.replace(/\/$/, ""))),
      );
    },
  };
}
