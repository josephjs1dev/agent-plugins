import { useCallback } from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { historyScopeSchema, type HistoryScope } from "essentials/history";
import { providerSchema, type Provider } from "essentials/providers";
import { z } from "zod";

/** The thread panel action that shows an environment's usage history. */
export const HISTORY_ACTION = "usage-history";
/** The Essentials page's nav panel path and its sub-paths. */
export const PAGE_PATH = "essentials";
export const PAGE_TABS = ["usage", "harnesses"] as const;
export type PageTab = (typeof PAGE_TABS)[number];

const historyParamsSchema = z.object({
  provider: providerSchema.catch("chatgpt"),
  days: z.union([z.literal(7), z.literal(30)]).catch(7),
  scope: historyScopeSchema.catch("workspace"),
});
export type HistoryParams = z.infer<typeof historyParamsSchema>;

/** Panel params round-trip through persistence, so parse them. */
export function parseHistoryParams(params: unknown): HistoryParams {
  const parsed = historyParamsSchema.safeParse(params ?? {});
  return parsed.success
    ? parsed.data
    : { provider: "chatgpt", days: 7, scope: "workspace" };
}

/** The tab a nav panel sub-path names; unknown paths show Usage. */
export function pageTab(subPath: string): PageTab {
  const first = subPath.split("/")[0];
  return PAGE_TABS.find((tab) => tab === first) ?? "usage";
}

/**
 * Opens usage history in the current thread's side panel. Returns false on a
 * surface without one, such as the Essentials page.
 */
export function useOpenHistory(): (
  provider: Provider,
  days: 7 | 30,
  scope: HistoryScope,
) => boolean {
  const navigate = useBbNavigate();
  return useCallback(
    (provider, days, scope) =>
      navigate.openThreadPanel({
        actionId: HISTORY_ACTION,
        title: "Usage history",
        params: { provider, days, scope },
      }),
    [navigate],
  );
}

/** Opens a tab of the Essentials page. */
export function useOpenPage(): (tab: PageTab) => void {
  const navigate = useBbNavigate();
  return useCallback(
    (tab) => navigate.toPluginPanel(PAGE_PATH, { subPath: tab }),
    [navigate],
  );
}
