import { historyCollectionSchema, type HistoryCollection } from "../history";
import type { Harness } from "../harnesses";
import type { Provider } from "../providers";
import { codexCollector } from "./codex";
import { createPiCollector } from "./pi";
import { opencodeCollector } from "./opencode";
import { claudeCollector } from "./claude";
import type { HistoryScan, QuotaCapability, UsageCollector } from "./types";

export interface UsageCollectorOptions {
  /** Further Pi session directories, such as the one a host runs Pi with. */
  piSessionDirectories?: readonly string[];
}

export function createUsageCollectors({
  piSessionDirectories = [],
}: UsageCollectorOptions = {}): Record<Harness, UsageCollector> {
  return {
    codex: codexCollector,
    pi: createPiCollector(piSessionDirectories),
    opencode: opencodeCollector,
    claude: claudeCollector,
  };
}

export const usageCollectors = createUsageCollectors();

export function quotaCapability(provider: Provider): QuotaCapability {
  const capabilities = Object.values(usageCollectors).flatMap((entry) =>
    entry.quota?.provider === provider ? [entry.quota] : [],
  );
  const [capability] = capabilities;

  if (!capability || capabilities.length !== 1) {
    throw new Error("Quota unavailable");
  }

  return capability;
}

/** Validate source output before it enters the normalized cache. */
export async function collectUsageHistory(
  collector: UsageCollector,
  scan: HistoryScan,
): Promise<HistoryCollection> {
  const result = historyCollectionSchema.parse(
    await collector.collectHistory(scan),
  );

  if (
    result.rows.some(
      (row) =>
        row.harness !== collector.harness ||
        !collector.providers.includes(row.provider),
    )
  ) {
    throw new Error("Invalid collector attribution");
  }

  return result;
}
