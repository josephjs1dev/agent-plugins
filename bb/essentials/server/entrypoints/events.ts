import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { contextReminder } from "./context-reminder";

export interface ObserveOptions {
  reminder: Pick<ReturnType<typeof contextReminder>, "observe" | "forget">;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * After each turn, advances Context Reminder for top-level threads. Child
 * threads are subagents or task threads, which the reminder skips.
 */
export function observeThreads(
  bb: Pick<BbPluginApi, "events" | "log">,
  { reminder }: ObserveOptions,
): void {
  bb.events.on("thread.idle", ({ thread }) => {
    // Handlers run detached: a slow context read must not hold the event.
    void (async () => {
      if (thread.parentThreadId) {
        return;
      }
      try {
        await reminder.observe(thread.id);
      } catch (error) {
        bb.log.warn(
          `Context Reminder failed for thread ${thread.id}: ${errorMessage(error)}`,
        );
      }
    })();
  });
  bb.events.on("thread.archived", ({ thread }) => {
    reminder.forget(thread.id);
  });
}
