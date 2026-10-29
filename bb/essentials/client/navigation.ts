import { useCallback } from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { providerSchema, type Provider } from "essentials/providers";
import { z } from "zod";

/** The thread panel action that shows usage history. */
export const HISTORY_ACTION = "usage-history";
/** The thread panel action that shows the workspace file explorer. */
export const FILE_EXPLORER_ACTION = "file-explorer";
/** The thread panel action that searches file contents. */
export const CONTENT_SEARCH_ACTION = "content-search";
/** The nav panel paths of the Usage history and Context Reminder pages. */
export const HISTORY_PAGE_PATH = "usage-history";
export const REMINDER_PAGE_PATH = "context-reminder";

const historyParamsSchema = z.object({
  provider: providerSchema.catch("chatgpt"),
  days: z.union([z.literal(7), z.literal(30)]).catch(7),
});
export type HistoryParams = z.infer<typeof historyParamsSchema>;

/** Panel params round-trip through persistence, so parse them. */
export function parseHistoryParams(params: unknown): HistoryParams {
  const parsed = historyParamsSchema.safeParse(params ?? {});
  return parsed.success ? parsed.data : { provider: "chatgpt", days: 7 };
}

/**
 * Opens usage history in the current thread's side panel. Returns false on a
 * surface without one, such as a nav page.
 */
export function useOpenHistory(): (
  provider: Provider,
  days: 7 | 30,
) => boolean {
  const navigate = useBbNavigate();
  return useCallback(
    (provider, days) =>
      navigate.openThreadPanel({
        actionId: HISTORY_ACTION,
        title: "Usage history",
        params: { provider, days },
      }),
    [navigate],
  );
}
