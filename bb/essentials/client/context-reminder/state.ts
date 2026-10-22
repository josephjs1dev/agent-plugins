import { useCallback, useState } from "react";
import { percentOfWindow } from "essentials/context-reminder/gauge";
import { reminderTier } from "essentials/context-reminder/reminder-policy";
import { errorMessage, useCall, useQuery, type Output } from "../data";
import { REMINDER_CHANGED } from "../../shared/signals";
import { clockTime, nextCardLabel } from "./labels";
import type { CardReading } from "./reminder-card";

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

/** What a reminder surface shows for one thread's state. */
export interface ReminderView {
  reading: CardReading;
  /** A reminder is due: the card shows until the user acts. */
  hasNotice: boolean;
  percent: number;
  /** When reminders resume or the next card is due; empty when neither. */
  status: string;
}

/**
 * The reminder to show, or null when there is nothing to show. Below Warn at,
 * `includeQuiet` still returns the reading, as the thread header does.
 */
export function reminderView(
  state: ReminderState | null,
  includeQuiet: boolean,
): ReminderView | null {
  if (!state || !state.config.enabled) {
    return null;
  }
  const { reading, notice, config } = state;
  // A preview notice can arrive before the thread's first reading.
  const tier =
    reading === null
      ? null
      : reminderTier(reading.usedTokens, reading.maxTokens, config);
  if (
    notice === null &&
    (reading === null || (tier === null && !includeQuiet))
  ) {
    return null;
  }
  const shown: CardReading = notice ?? {
    usedTokens: reading?.usedTokens ?? 0,
    maxTokens: reading?.maxTokens ?? 1,
    tier,
    snoozeMinutes: config.snoozeMinutes,
  };
  let status = "";
  if (state.snoozedUntil !== null) {
    status = `Snoozed until ${clockTime(state.snoozedUntil)}`;
  } else if (state.nextCardInTurns !== null) {
    status = nextCardLabel(state.nextCardInTurns);
  }
  return {
    reading: shown,
    hasNotice: notice !== null,
    percent: percentOfWindow(shown.usedTokens, shown.maxTokens),
    status,
  };
}
