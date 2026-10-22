import type { ContextReminderSettings, ReminderNotice } from "./contracts";
import { DEFAULT_WINDOW_TOKENS } from "./gauge";
import {
  FRESH_STATE,
  nextReminder,
  reminderTier,
  type ReminderState,
} from "./reminder-policy";

/**
 * Per-agent reminder state for one host. State lives in memory, so a host
 * restart clears turn counts and snoozes.
 */
export function createReminderTracker(now: () => number = Date.now) {
  const states = new Map<string, ReminderState>();

  return {
    /**
     * Advances the agent by one finished turn. Returns the notice to show, or
     * null. A missing window size assumes `DEFAULT_WINDOW_TOKENS`.
     */
    observe(
      agentId: string,
      usedTokens: number,
      maxTokens: number | null,
      settings: ContextReminderSettings,
    ): ReminderNotice | null {
      if (!settings.enabled || usedTokens <= 0) {
        return null;
      }

      const max = maxTokens || DEFAULT_WINDOW_TOKENS;
      const next = nextReminder(
        states.get(agentId) ?? FRESH_STATE,
        usedTokens,
        max,
        settings,
        now(),
      );
      states.set(agentId, next.state);

      return next.tier === null
        ? null
        : {
            usedTokens,
            maxTokens: max,
            tier: next.tier,
            snoozeMinutes: settings.snoozeMinutes,
          };
    },
    /** Pauses the agent's notices; returns the end as an ISO time. */
    snooze(agentId: string, minutes: number): string {
      const snoozedUntil = now() + minutes * 60_000;
      states.set(agentId, {
        ...(states.get(agentId) ?? FRESH_STATE),
        snoozedUntil,
      });

      return new Date(snoozedUntil).toISOString();
    },
    /**
     * Restarts the agent's turn count after the user dismisses a card, so the
     * next card waits a full `notifyEvery` turns. A rise to a higher tier
     * still shows at once.
     */
    dismiss(agentId: string): void {
      const state = states.get(agentId);

      if (state) {
        states.set(agentId, { ...state, turnsSinceCard: 0 });
      }
    },
    /** Turns the agent has finished above the warn threshold since its last card. */
    turnsSinceCard(agentId: string): number {
      return states.get(agentId)?.turnsSinceCard ?? 0;
    },
    forget(agentId: string): void {
      states.delete(agentId);
    },
    clear(): void {
      states.clear();
    },
  };
}

/** A preview notice at `percent` of a default window; no state changes. */
export function demoNotice(
  percent: number,
  settings: ContextReminderSettings,
): ReminderNotice {
  const used = Math.round((percent * DEFAULT_WINDOW_TOKENS) / 100);

  return {
    usedTokens: used,
    maxTokens: DEFAULT_WINDOW_TOKENS,
    tier: reminderTier(used, DEFAULT_WINDOW_TOKENS, settings) ?? "warn",
    snoozeMinutes: settings.snoozeMinutes,
  };
}
