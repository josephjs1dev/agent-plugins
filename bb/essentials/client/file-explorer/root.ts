import type { ExperimentalLiveFileTarget } from "@get-bb/plugin-sdk/app";
import type { ExplorerRoot } from "../../shared/file-explorer";

/**
 * bb's preview target of `path`, relative to `root`: a workspace file in a
 * thread, or a host file in a project's checkout.
 */
export function previewTarget(
  root: ExplorerRoot,
  path: string,
): ExperimentalLiveFileTarget {
  if (root.preview.kind === "workspace") {
    return {
      kind: "workspace",
      environmentId: root.preview.environmentId,
      path,
    };
  }
  return {
    kind: "host",
    hostId: root.preview.hostId,
    path: `${root.preview.path.replace(/\/+$/, "")}/${path}`,
  };
}
