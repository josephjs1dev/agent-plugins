import { useState } from "react";
import { useComposer } from "@get-bb/plugin-sdk/app";
import { percentOfWindow } from "essentials/context-reminder/gauge";
import { reminderTier } from "essentials/context-reminder/reminder-policy";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { errorMessage, useCall } from "../data";
import { ReminderCard } from "./reminder-card";
import { useReminder } from "./state";

/** The composer popup that previews a reminder. */
export const PREVIEW_POPUP = "context-reminder-preview";

const PREVIEW_PERCENTS = [30, 60, 90] as const;

function useThreadId(): string | null {
  const { scope } = useComposer();
  return scope.kind === "thread" ? scope.threadId : null;
}

function snoozeLabel(snoozedUntil: string | null): string {
  if (snoozedUntil === null) {
    return "";
  }
  const time = new Date(snoozedUntil).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return ` · snoozed until ${time}`;
}

/**
 * Shows above a thread composer while its context fill is at or above Warn
 * at: a slim pill, or the reminder card when one is due or the pill is open.
 */
export function ReminderBanner() {
  const composer = useComposer();
  const threadId = useThreadId();
  const { state, error, pending, act } = useReminder(threadId);
  const [expanded, setExpanded] = useState(false);
  if (!state || !state.config.enabled) {
    return null;
  }
  const { reading, notice, config } = state;
  // A preview notice can arrive before the thread's first reading.
  const tier =
    reading === null
      ? null
      : reminderTier(reading.usedTokens, reading.maxTokens, config);
  if (notice === null && (reading === null || tier === null)) {
    return null;
  }
  const shown = notice ?? {
    usedTokens: reading?.usedTokens ?? 0,
    maxTokens: reading?.maxTokens ?? 1,
    tier: tier ?? "warn",
    snoozeMinutes: config.snoozeMinutes,
  };
  if (notice !== null || expanded || reading === null) {
    return (
      <ReminderCard
        notice={shown}
        character={state.character}
        isRunning={composer.isRunning}
        pending={pending}
        error={error}
        closeLabel={notice === null ? "Hide" : "Dismiss"}
        onAction={(action) => {
          act(action, shown.snoozeMinutes).catch(() => undefined);
        }}
        onClose={() => {
          if (notice === null) {
            setExpanded(false);
          } else {
            act("dismiss").catch(() => undefined);
          }
        }}
      />
    );
  }
  const percent = percentOfWindow(shown.usedTokens, shown.maxTokens);
  return (
    <button
      type="button"
      aria-expanded={false}
      aria-label={`Context ${percent}% full. Show Context Reminder.`}
      onClick={() => setExpanded(true)}
      className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs hover:bg-state-hover"
    >
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full",
          tier === "ask" ? "bg-destructive" : "bg-amber-500",
        )}
      />
      <span className="tabular-nums">Context {percent}%</span>
      <span className="text-muted-foreground">
        {snoozeLabel(state.snoozedUntil)}
      </span>
    </button>
  );
}

/** Shows a sample reminder at a chosen fill; it changes no turn counts. */
export function ReminderPreview() {
  const composer = useComposer();
  const threadId = useThreadId();
  const call = useCall();
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (threadId === null) {
    return (
      <p className="p-3 text-sm text-muted-foreground">
        Open a thread to preview Context Reminder.
      </p>
    );
  }
  const preview = async (percent: number) => {
    setPending(percent);
    setError(null);
    try {
      await call("context_reminder.demo", { threadId, percent });
      composer.experimental_closePopup();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(null);
    }
  };
  return (
    <div className="space-y-2 p-3">
      <p className="text-sm font-medium">Preview Context Reminder</p>
      <p className="text-xs text-muted-foreground">
        Shows a sample reminder at this fill of a 1M-token window.
      </p>
      <div className="flex gap-2">
        {PREVIEW_PERCENTS.map((percent) => (
          <Button
            key={percent}
            size="sm"
            variant="outline"
            disabled={pending !== null}
            onClick={() => {
              preview(percent).catch(() => undefined);
            }}
          >
            {pending === percent ? "Showing…" : `${percent}%`}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
