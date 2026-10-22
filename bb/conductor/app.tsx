import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { PodiumView } from "./client/podium/view";

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "podium",
    title: "Conductor",
    icon: "Workflow",
    path: "podium",
    component: PodiumView,
  });
});
