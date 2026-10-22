import type { Attempt } from "../symphonies/models";
import {
  attemptMetrics,
  type DurationTotals,
  type TokenSum,
  type TokenTotals,
} from "../symphonies/metrics";

/** "2 attempts" for two tries, otherwise "N attempts". */
export function attemptCountLabel(count: number): string {
  return `${count} attempts`;
}

/** "1 task" for a single task, otherwise "N tasks". */
export function taskCountLabel(count: number): string {
  return count === 1 ? "1 task" : `${count} tasks`;
}

/** Short human timestamp like "Oct 6, 09:12". */
export function shortTimestamp(epochMillis: number): string {
  const date = new Date(epochMillis);
  const day = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const time = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${day}, ${time}`;
}

/** "12m" for under an hour, "9h 44m" beyond it, from milliseconds. */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) {
    return minutes === 1 ? "1m" : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/**
 * One attempt's duration: "12m work · 3h blocked" for a tracked attempt,
 * with the blocked span left out when there was none, or the plain wall
 * duration for a record stored before blocked time was tracked.
 */
export function attemptDurationLabel(attempt: Attempt): string {
  const metrics = attemptMetrics(attempt, Date.now());
  if (metrics.legacy) {
    return formatDuration(metrics.wallMs);
  }
  const parts = [`${formatDuration(metrics.workMs)} work`];
  if (metrics.blockedMs > 0) {
    parts.push(`${formatDuration(metrics.blockedMs)} blocked`);
  }
  return parts.join(" · ");
}

/** "48k" for 48 000, "942" below a thousand, "1.2m" beyond a million. */
export function tokenCountLabel(value: number): string {
  if (value < 1000) {
    return String(value);
  }
  if (value < 1_000_000) {
    return `${trimFraction(value / 1000)}k`;
  }
  return `${trimFraction(value / 1_000_000)}m`;
}

export function trimFraction(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** One summed field, e.g. "48k in"; null when no attempt reported it. */
export function tokenSumLabel(sum: TokenSum, suffix: string): string | null {
  if (sum.coverage === "unknown" || sum.total === null) {
    return null;
  }
  // A partial sum is a lower bound: attempts without the field may add more.
  const marker = sum.coverage === "partial" ? "≥ " : "";
  return `${marker}${tokenCountLabel(sum.total)}${suffix}`;
}

/**
 * Totals line like "48k in (40k cached) · 6k out". A field no attempt
 * reported is left out, and a record with none reads "—". Cached reads as
 * one figure beside a known input sum, and stands alone — "40k cached" —
 * when only the cache reads are known.
 */
export function tokenTotalsLabel(tokens: TokenTotals): string {
  const input = tokenSumLabel(tokens.input, " in");
  const cached = tokenSumLabel(tokens.cached, " cached");
  const output = tokenSumLabel(tokens.output, " out");
  if (input === null && cached === null && output === null) {
    return "—";
  }
  const parts: string[] = [];
  if (input !== null) {
    parts.push(cached === null ? input : `${input} (${cached})`);
  } else if (cached !== null) {
    parts.push(cached);
  }
  if (output !== null) {
    parts.push(output);
  }
  return parts.join(" · ");
}

/** One attempt's tokens, e.g. "48k in (40k cached) · 6k out" or "—". */
export function attemptTokensLabel(attempt: Attempt): string {
  return tokenTotalsLabel(attemptMetrics(attempt, Date.now()).tokens);
}

/**
 * Summed work time over several attempts. Records stored before blocked
 * time was tracked have no measured work — their work time is wall time —
 * so a sum over only such records reads as wall time instead.
 */
export function workTotalsLabel(totals: DurationTotals): string {
  const unit =
    totals.attemptCount > 0 && totals.legacyAttempts === totals.attemptCount
      ? "wall"
      : "work";
  return `${formatDuration(totals.workMs)} ${unit}`;
}
