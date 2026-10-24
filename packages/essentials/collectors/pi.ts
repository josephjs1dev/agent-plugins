import { homedir } from "node:os";
import { join } from "node:path";
import { createPiHistoryParser, piHistoryProviders } from "../history-parsers";
import type { HistoryCollection } from "../history";
import { collectJsonl } from "../history-sources";
import type { UsageCollector } from "./types";

/**
 * Pi history from Pi's own session directory and `extraDirectories`, such as
 * the directory a host runs Pi with. They must hold Pi session JSONL.
 */
export function createPiCollector(
  extraDirectories: readonly string[] = [],
): UsageCollector {
  return {
    harness: "pi",
    providers: piHistoryProviders,
    // Bumped when hosts could add session directories.
    revision: "session-directories",
    collectHistory({ since, signal, modifiedSince }) {
      return collectPi(
        since,
        signal,
        [piHistoryDirectory(), ...extraDirectories],
        modifiedSince,
      );
    },
  };
}

function expandHome(path: string): string {
  if (path === "~") {
    return homedir();
  }

  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

export function piHistoryDirectory(env = process.env): string {
  const agentDirectory =
    env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");

  return expandHome(
    env.PI_USAGE_SESSION_DIR ??
      env.PI_CODING_AGENT_SESSION_DIR ??
      join(expandHome(agentDirectory), "sessions"),
  );
}

export function collectPi(
  since: number,
  signal: AbortSignal,
  roots: readonly string[] = [piHistoryDirectory()],
  modifiedSince?: number,
): Promise<HistoryCollection> {
  return collectJsonl(
    roots,
    since,
    signal,
    createPiHistoryParser,
    modifiedSince,
  );
}
