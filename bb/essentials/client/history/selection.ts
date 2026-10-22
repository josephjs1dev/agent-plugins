import type { HistoryScope } from "essentials/history";
import type { Provider } from "essentials/providers";

export interface HistorySelection {
  provider: Provider;
  days: 7 | 30;
  scope: HistoryScope;
}

export function scopeLabel(scope: HistoryScope): string {
  return scope === "workspace"
    ? "This thread's environment"
    : "All environments on this host";
}
