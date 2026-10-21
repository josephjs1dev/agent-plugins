import { resolve } from "node:path";
import { usageCollectors } from "../src/collectors";
import type { UsageCollector } from "../src/collectors/types";
import type { Harness } from "../src/harnesses";
import type { HistoryCollection, HistoryRow } from "../src/history";

/** Inject source I/O while exercising the real registry metadata and validation. */
export function fakeCollectors(
  collect: (
    harness: Harness,
    since: number,
    signal: AbortSignal,
    modifiedSince?: number,
  ) => Promise<HistoryCollection>,
): UsageCollector[] {
  return Object.values(usageCollectors).map((collector) => ({
    ...collector,
    collectHistory: ({ since, signal, modifiedSince }) =>
      collect(collector.harness, since, signal, modifiedSince),
  }));
}

/** Matches rows recorded in a directory, for tests that predate session attribution. */
export function inDirectory(directory: string) {
  const expected = resolve(directory);

  return (row: HistoryRow) => resolve(row.cwd) === expected;
}
