import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { createWorkspaceSessions } from "essentials/workspace-sessions";
import { sessionLink } from "../engine/bb/sessions";
import type { contextReminder } from "./context-reminder";

type Sdk = BbPluginApi["sdk"];

export interface ObserveOptions {
  sdk: () => Sdk;
  sessions: ReturnType<typeof createWorkspaceSessions>;
  reminder: Pick<ReturnType<typeof contextReminder>, "observe" | "forget">;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * After each turn, saves the thread's session link for workspace history and
 * advances Context Reminder for top-level threads. Child threads are
 * subagents or task threads, which the reminder skips.
 */
export function observeThreads(
  bb: Pick<BbPluginApi, "events" | "log">,
  { sdk, sessions, reminder }: ObserveOptions,
): void {
  bb.events.on("thread.idle", ({ thread }) => {
    // Handlers run detached: a slow context read must not hold the event.
    void (async () => {
      try {
        const link = sessionLink(
          thread,
          await sdk().threads.context({ threadId: thread.id }),
        );
        if (link) {
          await sessions.record(link);
        }
      } catch (error) {
        bb.log.warn(
          `Essentials could not link thread ${thread.id}: ${errorMessage(error)}`,
        );
      }
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
