import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { ICONS } from "./shared/icons";
import {
  CONTENT_SEARCH_ACTION,
  FILE_EXPLORER_ACTION,
  HISTORY_ACTION,
  HISTORY_PAGE_PATH,
  REMINDER_PAGE_PATH,
} from "./client/navigation";
import { ContextReminderPage } from "./client/context-reminder/settings-page";
import { ReminderHeaderButton } from "./client/context-reminder/header-button";
import { ProviderUsageButton } from "./client/usage/provider-button";
import { HistoryPage, HistoryPanel } from "./client/history/panel";
import { cleanupAction } from "./client/child-threads/action";
import {
  FileExplorerPanel,
  NewThreadExplorerPanel,
} from "./client/file-explorer/panel";
import {
  ContentSearchPanel,
  NewThreadContentSearchPanel,
} from "./client/content-search/panel";
import { requestContentSearch } from "./client/content-search/state";
import { CleanupDialog } from "./client/child-threads/dialog";
import { CleanerSync } from "./client/cleaner/dialog";
import { CleanerIcon } from "./client/cleaner/icon";
import { openCleaner } from "./client/cleaner/state";
import {
  PREVIEW_POPUP,
  ReminderBanner,
  ReminderPreview,
} from "./client/context-reminder/banner";

export default definePluginApp((app) => {
  // The registered broom shadows the manifest glyph to add its notification
  // dot. The footer action and the command open the dialog that CleanerSync
  // renders.
  app.experimental_icons.register({
    name: ICONS.cleaner,
    component: CleanerIcon,
  });
  app.experimental_sidebarFooter.register({
    kind: "action",
    id: "cleaner",
    label: "Cleaner",
    icon: ICONS.cleaner,
    onActivate: openCleaner,
  });
  app.commands.register({
    id: "cleaner",
    title: "Cleaner: review old threads",
    run: openCleaner,
  });
  app.slots.experimental_appOverlay({
    id: "cleaner",
    component: CleanerSync,
  });
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
  // File content opens in bb's native preview. Each panel registers in a
  // thread and on the New thread screen under one ID, so its command opens
  // it on both.
  app.slots.threadPanelAction({
    id: FILE_EXPLORER_ACTION,
    title: "Explorer",
    icon: ICONS.folder,
    component: FileExplorerPanel,
    layout: "flush",
  });
  app.slots.experimental_newThreadPanelAction({
    id: FILE_EXPLORER_ACTION,
    title: "Explorer",
    icon: ICONS.folder,
    component: NewThreadExplorerPanel,
    layout: "flush",
  });
  app.slots.threadPanelAction({
    id: CONTENT_SEARCH_ACTION,
    title: "Search",
    icon: ICONS.search,
    component: ContentSearchPanel,
    layout: "flush",
  });
  app.slots.experimental_newThreadPanelAction({
    id: CONTENT_SEARCH_ACTION,
    title: "Search",
    icon: ICONS.search,
    component: NewThreadContentSearchPanel,
    layout: "flush",
  });
  app.commands.register({
    id: "open-file-explorer",
    title: "Explorer: browse files",
    defaultShortcut: { key: "b", mod: true },
    isAvailable: ({ threadId, projectId }) =>
      threadId !== null || projectId !== null,
    run: ({ openPanel }) => {
      openPanel({ actionId: FILE_EXPLORER_ACTION, title: "Explorer" });
    },
  });
  app.commands.register({
    id: "search-file-contents",
    title: "Search: find in files",
    defaultShortcut: { key: "f", mod: true, shift: true },
    isAvailable: ({ threadId, projectId }) =>
      threadId !== null || projectId !== null,
    run: ({ threadId, projectId, openPanel }) => {
      requestContentSearch(threadId ?? `project:${projectId ?? ""}`);
      openPanel({ actionId: CONTENT_SEARCH_ACTION, title: "Search" });
    },
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
