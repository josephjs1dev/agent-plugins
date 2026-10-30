import { spawn } from "node:child_process";

/** A partial record above this size stops the search instead of filling memory. */
const MAX_PENDING_CHARS = 16 * 1024 * 1024;
const MAX_STDERR_CHARS = 16 * 1024;

export interface RipgrepOptions {
  /** The ripgrep binary. Defaults to `rg` on the host's PATH. */
  bin?: string;
  /** The search's own deadline, below the server's 15-second deadline. */
  timeoutMs?: number;
}

export interface RipgrepExit {
  code: number | null;
  stderr: string;
  /** `add`, the deadline, or an oversized record stopped ripgrep. */
  stopped: boolean;
  /** The deadline or an oversized record stopped ripgrep. */
  limited: boolean;
}

/**
 * Runs ripgrep with `args` in `root` and passes each `separator`-terminated
 * record of its output to `add`. `add` returns false to stop ripgrep early.
 * Cancellation kills ripgrep and rejects with the signal's reason.
 */
export function runRipgrep(
  root: string,
  args: readonly string[],
  signal: AbortSignal,
  separator: string,
  add: (record: string) => boolean,
  { bin = "rg", timeoutMs = 10_000 }: RipgrepOptions = {},
  maxPendingChars = MAX_PENDING_CHARS,
): Promise<RipgrepExit> {
  return new Promise((done, fail) => {
    const child = spawn(bin, args, {
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
        let end = pending.indexOf(separator);
        end >= 0;
        end = pending.indexOf(separator)
      ) {
        const record = pending.slice(0, end);
        pending = pending.slice(end + separator.length);

        if (!add(record)) {
          stop();

          return;
        }
      }

      if (pending.length > maxPendingChars) {
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

      done({ code, stderr, stopped, limited });
    });
  });
}
