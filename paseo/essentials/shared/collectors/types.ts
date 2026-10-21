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
  collectHistory(scan: HistoryScan): Promise<HistoryCollection>;
  quota?: QuotaCapability;
}
