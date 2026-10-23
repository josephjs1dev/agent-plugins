import { useMemo } from "react";
import { toast } from "sonner";
import {
  experimental_THREAD_ACTION_GROUPS as GROUPS,
  experimental_useSidebarThreads as useSidebarThreads,
  type PluginThreadActionRegistration,
} from "@get-bb/plugin-sdk/app";
import {
  cleanupActionSchema,
  describePlan,
  type CleanupAction,
} from "../../shared/child-threads";
import { ICONS } from "../../shared/icons";
import { errorMessage, useCall } from "../data";
import { confirmCleanup } from "./dialog";

const LIFECYCLES = ["active", "archived"] as const;

interface Data {
  /** Threads with at least one child in bb's thread list. */
  parents: ReadonlySet<string>;
  call: ReturnType<typeof useCall>;
}

function useData(): Data {
  const { threads } = useSidebarThreads({
    experimental_lifecycles: LIFECYCLES,
  });
  const call = useCall();
  const parents = useMemo(
    () =>
      new Set(
        threads.flatMap((thread) =>
          thread.parentThreadId ? [thread.parentThreadId] : [],
        ),
      ),
    [threads],
  );
  return { parents, call };
}

/** Plans on the server, then asks the user to confirm the plan. */
async function start(data: Data, threadId: string, action: CleanupAction) {
  try {
    const plan = await data.call("child_threads.plan", { threadId, action });
    if (plan.targets.length) {
      confirmCleanup(threadId, plan);
    } else {
      toast(describePlan(plan));
    }
  } catch (cause) {
    toast.error(errorMessage(cause));
  }
}

/** "Clean up child threads" in every menu of a thread that has children. */
export const cleanupAction: PluginThreadActionRegistration<Data> = {
  id: "child-threads",
  title: "Clean up child threads",
  icon: ICONS.archive,
  group: GROUPS.lifecycle,
  order: 100,
  useData,
  item: ({ thread, data }) => {
    if (!data.parents.has(thread.id)) {
      return null;
    }
    return {
      label: "Clean up child threads",
      icon: ICONS.archive,
      choices: {
        items: [
          {
            id: "archive",
            label: "Archive idle child threads",
            icon: ICONS.archive,
          },
          {
            id: "delete",
            label: "Delete idle child threads",
            icon: ICONS.trash,
          },
        ],
        hint: "Busy child threads, and the threads above them, stay.",
      },
      run: async ({ value }) => {
        const action = cleanupActionSchema.safeParse(value);
        if (action.success) {
          await start(data, thread.id, action.data);
        }
      },
    };
  },
};
