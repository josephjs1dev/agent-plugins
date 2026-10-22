import { useCallback, useState } from "react";
import { errorMessage, useCall, useQuery, type Output } from "../data";
import { REMINDER_CHANGED } from "../../shared/signals";

export type ReminderState = Output<"context_reminder.state">;
export type ReminderAction = "compact" | "snooze" | "dismiss";

/** True when a `REMINDER_CHANGED` payload concerns this thread or all threads. */
function concerns(threadId: string | null) {
  return (payload: unknown) => {
    if (typeof payload !== "object" || payload === null) {
      return false;
    }
    const target = (payload as { threadId?: unknown }).threadId;
    return target === null || target === threadId;
  };
}

/**
 * One thread's Context Reminder state, refetched when the server signals a
 * change, plus the card actions. Each action returns the new state.
 */
export function useReminder(threadId: string | null) {
  const call = useCall();
  const query = useQuery(
    "context_reminder.state",
    { threadId: threadId ?? "" },
    {
      enabled: threadId !== null,
      signal: REMINDER_CHANGED,
      accepts: concerns(threadId),
    },
  );
  const { set } = query;
  const [pending, setPending] = useState<ReminderAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const act = useCallback(
    async (action: ReminderAction, snoozeMinutes = 0) => {
      if (threadId === null) {
        return;
      }
      setPending(action);
      setError(null);
      try {
        if (action === "compact") {
          set(await call("context_reminder.compact", { threadId }));
        } else if (action === "snooze") {
          set(
            await call("context_reminder.snooze", {
              threadId,
              minutes: snoozeMinutes,
            }),
          );
        } else {
          set(await call("context_reminder.dismiss", { threadId }));
        }
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        setPending(null);
      }
    },
    [call, set, threadId],
  );
  return { state: query.data, error: error ?? query.error, pending, act };
}
