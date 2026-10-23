import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { PODIUM_PATH } from "./client/podium/links";
import { PodiumView } from "./client/podium/view";
import { SymphoniesHeaderPill } from "./client/symphonies/header-pill";

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "podium",
    title: "Conductor",
    icon: "Workflow",
    path: PODIUM_PATH,
    component: PodiumView,
  });
  app.slots.experimental_threadHeaderAction({
    id: "symphonies",
    title: "Ongoing symphonies",
    component: SymphoniesHeaderPill,
  });
});
