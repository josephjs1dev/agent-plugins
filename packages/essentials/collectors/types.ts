import type { Harness } from "../harnesses";
import type { HistoryCollection } from "../history";
import type { Provider } from "../providers";
import type { Quota, Usage } from "../usage";

export interface HistoryScan {
  since: number;
  modifiedSince?: number;
  signal: AbortSignal;
}

export interface QuotaCapability {
  provider: Provider;
  read(signal: AbortSignal): Promise<Quota>;
  describeError(error: unknown): string;
  describeIssue?(error: unknown): Usage["issue"];
}

/** A harness owns source I/O; returned records identify their subscription. */
export interface UsageCollector {
  harness: Harness;
  providers: readonly Provider[];
  /**
   * Changes when the collector would read existing sources differently, such
   * as new roots or prices. A changed revision rescans its whole history.
   */
  revision?: string;
  collectHistory(scan: HistoryScan): Promise<HistoryCollection>;
  quota?: QuotaCapability;
}
