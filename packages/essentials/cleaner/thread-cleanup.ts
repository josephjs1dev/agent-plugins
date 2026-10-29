import { basename, dirname } from "node:path";
import { deleteClaudeSession } from "./claude-session";
import { deleteCodexSession } from "./codex-session";
import type {
  CleanupResult,
  CleanupTarget,
  SessionProvider,
} from "./contracts";
import { lstatOrNull } from "./fs";
import { resolveProviderHome } from "./provider-home";

type DeleteSession = (
  home: string,
  id: string,
  signal: AbortSignal,
) => Promise<void>;

export interface CleanupOptions {
  /** Resolves the Codex CLI only when a Codex session needs it. */
  codexBin: () => string | Promise<string>;
  env?: NodeJS.ProcessEnv;
}

function waiting(message: string): CleanupResult {
  return { state: "waiting", deleted: 0, message };
}

/**
 * Deletes a deleted bb thread's recorded native sessions once bb finished
 * shutdown. bb removes the thread's storage directory after its runtime
 * stops, so a missing directory that Cleaner saw before proves shutdown.
 */
export async function cleanupThreadSessions(
  target: CleanupTarget,
  { codexBin, env = process.env }: CleanupOptions,
  signal: AbortSignal,
): Promise<CleanupResult> {
  if (
    basename(target.storagePath) !== target.threadId ||
    dirname(target.storagePath) === target.storagePath
  ) {
    throw new Error("Invalid bb thread-storage target.");
  }

  if (!target.storageObserved) {
    return waiting(
      "bb thread storage was not observed before deletion, so shutdown cannot be confirmed.",
    );
  }

  if (await lstatOrNull(target.storagePath)) {
    return waiting(
      "Waiting for bb to stop the runtime and remove thread storage.",
    );
  }

  const deleteByProvider: Record<SessionProvider, DeleteSession> = {
    "claude-code": deleteClaudeSession,
    codex: async (home, id, abort) =>
      deleteCodexSession(await codexBin(), home, id, abort),
  };
  let deleted = 0;

  for (const session of target.sessions) {
    signal.throwIfAborted();
    const home = resolveProviderHome(session, env);
    await deleteByProvider[session.provider](home, session.id, signal);
    deleted++;
  }

  return { state: "done", deleted, message: null };
}
