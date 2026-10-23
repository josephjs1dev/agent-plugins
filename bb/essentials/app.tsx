import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { ICONS } from "./shared/icons";
import {
  HISTORY_ACTION,
  HISTORY_PAGE_PATH,
  REMINDER_PAGE_PATH,
} from "./client/navigation";
import { ContextReminderPage } from "./client/context-reminder/settings-page";
import { ReminderHeaderButton } from "./client/context-reminder/header-button";
import { ProviderUsageButton } from "./client/usage/provider-button";
import { HistoryPage, HistoryPanel } from "./client/history/panel";
import { cleanupAction } from "./client/child-threads/action";
import { CleanupDialog } from "./client/child-threads/dialog";
import {
  PREVIEW_POPUP,
  ReminderBanner,
  ReminderPreview,
} from "./client/context-reminder/banner";

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "usage-history",
    title: "Usage history",
    icon: ICONS.chart,
    path: HISTORY_PAGE_PATH,
    component: HistoryPage,
  });
  app.slots.navPanel({
    id: "context-reminder",
    title: "Context Reminder",
    icon: ICONS.alarm,
    path: REMINDER_PAGE_PATH,
    component: ContextReminderPage,
  });
  app.slots.experimental_threadHeaderAction({
    id: "usage",
    title: "Provider usage",
    component: ProviderUsageButton,
  });
  app.slots.experimental_threadHeaderAction({
    id: "context-reminder",
    title: "Context Reminder",
    component: ReminderHeaderButton,
  });
  app.slots.threadPanelAction({
    id: HISTORY_ACTION,
    title: "Usage history",
    icon: ICONS.chart,
    component: HistoryPanel,
  });
  app.slots.experimental_threadAction(cleanupAction);
  app.slots.experimental_appOverlay({
    id: "child-threads",
    component: CleanupDialog,
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
