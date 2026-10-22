import { useState } from "react";
import { useComposer } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { errorMessage, useCall } from "../data";
import { ReminderCard } from "./reminder-card";
import { reminderView, useReminder } from "./state";

/** The composer popup that previews a reminder. */
export const PREVIEW_POPUP = "context-reminder-preview";

const PREVIEW_PERCENTS = [30, 60, 90] as const;

function useThreadId(): string | null {
  const { scope } = useComposer();
  return scope.kind === "thread" ? scope.threadId : null;
}

/**
 * Shows the reminder card above a thread composer while a reminder is due.
 * The thread header shows the fill the rest of the time.
 */
export function ReminderBanner() {
  const composer = useComposer();
  const threadId = useThreadId();
  const { state, error, pending, act } = useReminder(threadId);
  const view = reminderView(state, false);
  if (!state || !view?.hasNotice) {
    return null;
  }
  const { reading } = view;
  return (
    <ReminderCard
      notice={reading}
      character={state.character}
      isRunning={composer.isRunning}
      pending={pending}
      error={error}
      snoozedUntil={state.snoozedUntil}
      closeLabel="Dismiss"
      onAction={(action) => {
        act(action, reading.snoozeMinutes).catch(() => undefined);
      }}
      onClose={() => {
        act("dismiss").catch(() => undefined);
      }}
    />
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
