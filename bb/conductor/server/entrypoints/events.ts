import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { AgentIds } from "../engine/bb/agent-ids";
import type { SymphonyService } from "./symphonies";

/** Marks unreported work when a source thread's turn ends or the thread leaves. */
export function observeThreads(
  bb: Pick<BbPluginApi, "events">,
  service: Pick<SymphonyService, "execution">,
  ids: AgentIds,
  ready: Promise<void>,
): void {
  const interrupt = async (threadId: string, message: string) => {
    await ready;
    await service.execution.interrupt(await ids.agentOf(threadId), message);
  };
  bb.events.on("thread.idle", ({ thread }) =>
    interrupt(
      thread.id,
      "Source agent turn completed before its task report. Resume in the source conversation; claims remain held.",
    ),
  );
  bb.events.on("thread.failed", ({ thread }) =>
    interrupt(
      thread.id,
      "Source agent turn failed before its task report. Resume in the source conversation; claims remain held.",
    ),
  );
  for (const event of ["thread.archived", "thread.deleted"] as const) {
    bb.events.on(event, ({ thread }) =>
      interrupt(
        thread.id,
        "The source agent was archived with unreported work. Its claims remain unresolved.",
      ),
    );
  }
}
