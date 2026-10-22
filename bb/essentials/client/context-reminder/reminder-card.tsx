import type { Character } from "essentials/context-reminder/sprite";
import type { ReminderNotice } from "essentials/context-reminder/contracts";
import { formatGauge } from "essentials/context-reminder/gauge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PixelSprite } from "./pixel-sprite";
import type { ReminderAction } from "./state";

const ADVICE = {
  warn: "This thread is getting long. Plan a stopping point.",
  ask: "Context is large. Compact before the next task.",
} as const;

export interface ReminderCardProps {
  notice: ReminderNotice;
  character: Character;
  /** The thread's turn is running, so it cannot compact yet. */
  isRunning: boolean;
  pending: ReminderAction | null;
  error: string | null;
  /** The label of the close action: Dismiss for a notice, Hide for a pill. */
  closeLabel: string;
  onAction(this: void, action: ReminderAction): void;
  onClose(this: void): void;
}

/** The reminder: sprite, gauge, advice, and its actions. */
export function ReminderCard({
  notice,
  character,
  isRunning,
  pending,
  error,
  closeLabel,
  onAction,
  onClose,
}: ReminderCardProps) {
  const busy = pending !== null;
  return (
    <section
      aria-label="Context Reminder"
      className="flex items-start gap-3 rounded-lg border bg-card p-3"
    >
      <PixelSprite character={character} tier={notice.tier} pixelSize={3} />
      <div className="min-w-0 flex-1 space-y-1">
        <h3
          className={cn(
            "text-sm font-semibold",
            notice.tier === "ask"
              ? "text-destructive"
              : "text-amber-600 dark:text-amber-400",
          )}
        >
          Context Reminder
        </h3>
        <p className="text-sm tabular-nums">
          {formatGauge(notice.usedTokens, notice.maxTokens)}
        </p>
        <p className="text-sm text-muted-foreground">{ADVICE[notice.tier]}</p>
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
            disabled={busy}
            onClick={() => onAction("snooze")}
          >
            {pending === "snooze"
              ? "Snoozing…"
              : `Snooze ${notice.snoozeMinutes} min`}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>
            {closeLabel}
          </Button>
        </div>
      </div>
    </section>
  );
}

function compactLabel(isRunning: boolean, pending: ReminderAction | null) {
  if (pending === "compact") {
    return "Compacting…";
  }
  return isRunning ? "Compact when idle" : "Compact now";
}
