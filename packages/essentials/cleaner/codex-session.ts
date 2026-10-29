import { spawn } from "node:child_process";
import { nativeSessionSchema } from "./contracts";

const INITIALIZE_ID = 0;
const DELETE_ID = 1;
const TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
/** Codex reports an already deleted session with one of these errors. */
const ALREADY_DELETED = /not found|does not exist|no rollout|unable to find/i;

interface Response {
  id?: number;
  error?: { message?: string };
  result?: unknown;
}

/**
 * Deletes one native Codex session through `codex app-server --stdio` and
 * its `thread/delete` request, with no model turn. Codex removes its own
 * transcript and state rows. The request is idempotent after a lost response.
 */
export async function deleteCodexSession(
  bin: string,
  home: string,
  id: string,
  signal: AbortSignal,
): Promise<void> {
  nativeSessionSchema.shape.id.parse(id);
  signal.throwIfAborted();

  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["app-server", "--stdio"], {
      env: { ...process.env, CODEX_HOME: home },
      stdio: ["pipe", "pipe", "ignore"],
    });
    let buffer = "";
    let bytes = 0;
    let done = false;
    const finish = (error?: Error) => {
      if (done) {
        return;
      }

      done = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      child.stdin.destroy();
      child.stdout.destroy();
      child.kill();

      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const abort = () => finish(new Error("Session deletion cancelled."));
    const timer = setTimeout(
      () => finish(new Error("Codex session deletion timed out.")),
      TIMEOUT_MS,
    );
    const send = (value: unknown) =>
      child.stdin.write(`${JSON.stringify(value)}\n`);
    // Initialize first, then request the deletion once Codex accepts it.
    const handle = (response: Response) => {
      if (response.id !== INITIALIZE_ID && response.id !== DELETE_ID) {
        return;
      }

      if (response.error) {
        const message =
          response.error.message ?? "Codex rejected session deletion.";

        if (response.id === DELETE_ID && ALREADY_DELETED.test(message)) {
          finish();
        } else {
          finish(new Error(message));
        }
      } else if ("result" in response) {
        if (response.id === DELETE_ID) {
          finish();

          return;
        }

        send({ method: "initialized", params: {} });
        send({
          id: DELETE_ID,
          method: "thread/delete",
          params: { threadId: id },
        });
      }
    };

    signal.addEventListener("abort", abort, { once: true });
    child.once("error", (error) => finish(error));
    child.once("close", () =>
      finish(new Error("Codex closed before confirming session deletion.")),
    );
    child.stdin.on("error", (error) => finish(error));
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      bytes += Buffer.byteLength(chunk);

      if (bytes > MAX_RESPONSE_BYTES) {
        finish(new Error("Codex deletion response exceeded 1 MiB."));

        return;
      }

      buffer += chunk;

      for (
        let newline = buffer.indexOf("\n");
        !done && newline >= 0;
        newline = buffer.indexOf("\n")
      ) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        let response: Response;

        try {
          response = JSON.parse(line) as Response;
        } catch {
          continue;
        }

        handle(response);
      }
    });

    if (signal.aborted) {
      abort();

      return;
    }

    send({
      id: INITIALIZE_ID,
      method: "initialize",
      params: {
        clientInfo: { name: "essentials_cleaner", version: "1.0" },
        capabilities: { experimentalApi: true },
      },
    });
  });
}
