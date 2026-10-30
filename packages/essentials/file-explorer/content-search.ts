import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { isHiddenPath } from "./browser";
import {
  contentSearchRequestSchema,
  createContentCollector,
  ripgrepArgs,
  type ContentSearchRequest,
  type ContentSearchResult,
} from "./content";
import { isInside } from "./reader";
import { runRipgrep, type RipgrepOptions } from "./ripgrep";

export type ContentSearchOptions = RipgrepOptions;

/**
 * Searches the contents of the files in `folder` below `rootPath` with
 * ripgrep. A file or match limit, or the deadline, returns the partial result
 * instead of an error. An invalid pattern fails with ripgrep's message.
 * ripgrep follows no link, and the folder must stay inside the canonical root.
 */
export async function searchContent(
  rootPath: string,
  input: ContentSearchRequest,
  signal: AbortSignal,
  options: ContentSearchOptions = {},
): Promise<ContentSearchResult> {
  const request = contentSearchRequestSchema.parse(input);
  signal.throwIfAborted();
  const root = await realpath(rootPath);
  signal.throwIfAborted();
  let target: string;

  try {
    target = await realpath(resolve(root, request.folder));
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "ENOENT") {
      throw new Error("This folder no longer exists. Search all files.", {
        cause: error,
      });
    }

    throw error;
  }

  if (!isInside(root, target)) {
    throw new Error("Folder is outside the workspace.");
  }

  const collector = createContentCollector();

  if (!request.showHidden && isHiddenPath(request.folder)) {
    return collector.finish(false);
  }

  signal.throwIfAborted();

  const { code, stderr, stopped, limited } = await runRipgrep(
    root,
    ripgrepArgs(request),
    signal,
    "\n",
    (line) => collector.add(line),
    options,
  );

  if (stopped) {
    return collector.finish(limited);
  }

  // ripgrep exits 1 when nothing matches, and 2 after any error,
  // including globs that leave no file to search.
  if (
    code === 0 ||
    code === 1 ||
    (code === 2 && stderr.includes("No files were searched"))
  ) {
    return collector.finish(false);
  }

  if (code === 2 && /regex parse error|error parsing glob/.test(stderr)) {
    throw new Error(stderr.replace(/^rg: /, "").trim().slice(0, 500));
  }

  if (code === 2) {
    // An unreadable file or folder: keep what ripgrep found.
    return collector.finish(true);
  }

  throw new Error(`ripgrep exited with code ${String(code)}.`);
}
