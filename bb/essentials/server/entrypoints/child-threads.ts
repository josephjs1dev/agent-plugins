import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { planCleanup } from "../../shared/child-threads";
import { readChildThreads, runCleanup } from "../engine/bb/child-threads";
import type { Handlers } from "./contract";

type Sdk = BbPluginApi["sdk"];

/** Archives or deletes a thread's idle child threads. bb-only. */
export function childThreadHandlers(
  sdk: () => Sdk,
): Pick<Handlers, "child_threads.plan" | "child_threads.run"> {
  return {
    async "child_threads.plan"({ threadId, action }) {
      return planCleanup(await readChildThreads(sdk(), threadId), action);
    },
    "child_threads.run": ({ threadId, action, threadIds }) =>
      runCleanup(sdk(), { rootId: threadId, action, threadIds }),
  };
}
