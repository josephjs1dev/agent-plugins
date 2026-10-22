import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { ICONS } from "./shared/icons";
import { HISTORY_ACTION, PAGE_PATH } from "./client/navigation";
import { EssentialsPage } from "./client/page";
import { ProviderUsageButton } from "./client/usage/provider-button";
import { WorkspaceUsageButton } from "./client/usage/workspace-button";
import { HistoryPanel } from "./client/history/panel";
import {
  PREVIEW_POPUP,
  ReminderBanner,
  ReminderPreview,
} from "./client/context-reminder/banner";

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "essentials",
    title: "Essentials",
    icon: ICONS.gauge,
    path: PAGE_PATH,
    component: EssentialsPage,
  });
  app.slots.experimental_threadHeaderAction({
    id: "usage",
    title: "Provider usage",
    component: ProviderUsageButton,
  });
  app.slots.experimental_threadHeaderAction({
    id: "workspace-usage",
    title: "Workspace usage",
    component: WorkspaceUsageButton,
  });
  app.slots.threadPanelAction({
    id: HISTORY_ACTION,
    title: "Usage history",
    icon: ICONS.chart,
    component: HistoryPanel,
  });
  app.composer.customize({
    id: "context-reminder",
    scopes: ["thread"],
    banners: [
      { id: "context-reminder", chrome: "bare", component: ReminderBanner },
    ],
    plusMenu: [
      {
        id: "preview-context-reminder",
        label: "Preview Context Reminder",
        icon: ICONS.gauge,
        run: ({ composer }) => {
          composer.experimental_openPopup(PREVIEW_POPUP);
        },
      },
    ],
    experimental_popups: [
      {
        id: PREVIEW_POPUP,
        label: "Preview Context Reminder",
        component: ReminderPreview,
      },
    ],
  });
});
