import type { Character } from "essentials/context-reminder/sprite";
import { formatGauge } from "essentials/context-reminder/gauge";
import type { ReminderTier } from "essentials/context-reminder/reminder-policy";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { clockTime } from "./labels";
import { PixelSprite } from "./pixel-sprite";
import type { ReminderAction } from "./state";

const ADVICE = {
  warn: "This thread is getting long. Plan a stopping point.",
  ask: "Context is large. Compact before the next task.",
  none: "Plenty of room left in this thread's context window.",
} as const;

const TONES = {
  warn: "text-amber-600 dark:text-amber-400",
  ask: "text-destructive",
  none: "text-foreground",
} as const;

/** What the card shows: a notice, or the latest reading below Warn at. */
export interface CardReading {
  usedTokens: number;
  maxTokens: number;
  tier: ReminderTier | null;
  snoozeMinutes: number;
}

export interface ReminderCardProps {
  notice: CardReading;
  character: Character;
  /** The thread's turn is running, so it cannot compact yet. */
  isRunning: boolean;
  pending: ReminderAction | null;
  error: string | null;
  /** The end of the thread's snooze, or null when it is not snoozed. */
  snoozedUntil: string | null;
  /** A status line under the advice, such as when the next card is due. */
  status?: string | undefined;
  /** The close action's label, such as Dismiss or Hide; null hides it. */
  closeLabel: string | null;
  onAction(this: void, action: ReminderAction): void;
  onClose(this: void): void;
  className?: string | undefined;
}

/** The reminder: sprite, gauge, advice, and its actions. */
export function ReminderCard({
  notice,
  character,
  isRunning,
  pending,
  error,
  snoozedUntil,
  status,
  closeLabel,
  onAction,
  onClose,
  className,
}: ReminderCardProps) {
  const busy = pending !== null;
  const tone = TONES[notice.tier ?? "none"];
  return (
    <section
      aria-label="Context Reminder"
      className={cn(
        "flex items-start gap-3 rounded-lg border bg-card p-3",
        className,
      )}
    >
      <PixelSprite character={character} tier={notice.tier} pixelSize={3} />
      <div className="min-w-0 flex-1 space-y-1">
        <h3 className={cn("text-sm font-semibold", tone)}>Context Reminder</h3>
        <p className="text-sm tabular-nums">
          {formatGauge(notice.usedTokens, notice.maxTokens)}
        </p>
        <p className="text-sm text-muted-foreground">
          {ADVICE[notice.tier ?? "none"]}
        </p>
        {snoozedUntil !== null && (
          <p className="text-xs text-muted-foreground">
            Reminders are paused until {clockTime(snoozedUntil)}. You can snooze
            again after that.
          </p>
        )}
        {status && <p className="text-xs text-muted-foreground">{status}</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            disabled={isRunning || busy}
            onClick={() => onAction("compact")}
          >
            {compactLabel(isRunning, pending)}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || snoozedUntil !== null}
            onClick={() => onAction("snooze")}
          >
            {snoozeLabel(notice.snoozeMinutes, snoozedUntil, pending)}
          </Button>
          {closeLabel !== null && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>
              {closeLabel}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function snoozeLabel(
  minutes: number,
  snoozedUntil: string | null,
  pending: ReminderAction | null,
) {
  if (pending === "snooze") {
    return "Snoozing…";
  }
  return snoozedUntil === null
    ? `Snooze ${minutes} min`
    : `Snoozed until ${clockTime(snoozedUntil)}`;
}

function compactLabel(isRunning: boolean, pending: ReminderAction | null) {
  if (pending === "compact") {
    return "Compacting…";
  }
  return isRunning ? "Compact when idle" : "Compact now";
}
