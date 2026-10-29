import { spawn } from "node:child_process";
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

/** A partial line above this size stops the search instead of filling memory. */
const MAX_PENDING_CHARS = 16 * 1024 * 1024;
const MAX_STDERR_CHARS = 16 * 1024;

export interface ContentSearchOptions {
  /** The ripgrep binary. Defaults to `rg` on the host's PATH. */
  bin?: string;
  /** The search's own deadline, below the server's 15-second deadline. */
  timeoutMs?: number;
}

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
  { bin = "rg", timeoutMs = 10_000 }: ContentSearchOptions = {},
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

  return new Promise((done, fail) => {
    const child = spawn(bin, ripgrepArgs(request), {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let pending = "";
    let stderr = "";
    let stopped = false;
    let limited = false;
    const stop = () => {
      stopped = true;
      child.kill("SIGKILL");
    };

    const timer = setTimeout(() => {
      limited = true;
      stop();
    }, timeoutMs);
    signal.addEventListener("abort", stop, { once: true });
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (stopped) {
        return;
      }

      pending += chunk;

      for (
        let newline = pending.indexOf("\n");
        newline >= 0;
        newline = pending.indexOf("\n")
      ) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);

        if (!collector.add(line)) {
          stop();

          return;
        }
      }

      if (pending.length > MAX_PENDING_CHARS) {
        limited = true;
        stop();
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(0, MAX_STDERR_CHARS);
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      cleanup();
      fail(
        error.code === "ENOENT"
          ? new Error(
              "ripgrep (rg) is not installed on this host. Install it, or set ESSENTIALS_RG_BIN.",
            )
          : new Error("Could not start ripgrep.", { cause: error }),
      );
    });
    child.on("close", (code) => {
      cleanup();

      if (signal.aborted) {
        fail(signal.reason);

        return;
      }

      if (stopped) {
        done(collector.finish(limited));

        return;
      }

      // ripgrep exits 1 when nothing matches, and 2 after any error,
      // including globs that leave no file to search.
      if (
        code === 0 ||
        code === 1 ||
        (code === 2 && stderr.includes("No files were searched"))
      ) {
        done(collector.finish(false));

        return;
      }

      if (code === 2 && /regex parse error|error parsing glob/.test(stderr)) {
        fail(new Error(stderr.replace(/^rg: /, "").trim().slice(0, 500)));

        return;
      }

      if (code === 2) {
        // An unreadable file or folder: keep what ripgrep found.
        done(collector.finish(true));

        return;
      }

      fail(new Error(`ripgrep exited with code ${String(code)}.`));
    });
  });
}
