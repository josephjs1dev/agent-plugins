import { useCallback } from "react";
import type { StoredSymphony } from "conductor/symphonies/models";
import { usePodiumQuery, usePodiumRpc } from "../data";
import { useNow, usePodium, useViewState } from "../podium/context";
import { useElementWidth } from "../ui/use-element-width";
import { SymphonyBrowser } from "./browser";
import type { ProfilesData, SymphoniesData } from "./list";
import { SymphonyHeader, SymphonyToolbar } from "./toolbar";

/** Below this width the section shows one pane at a time, as in Paseo. */
const COMPACT_WIDTH = 740;

/** The symphony list and symphony detail. */
export function SymphoniesSection() {
  const { session, openAgent } = usePodium();
  const state = useViewState();
  const now = useNow();
  const rpc = usePodiumRpc();
  const [measure, width] = useElementWidth<HTMLDivElement>();
  const compact = width > 0 && width < COMPACT_WIDTH;
  const selectedId = state.symphonySelection?.id;
  const list = usePodiumQuery("symphonies.list", {});
  const read = usePodiumQuery(
    "symphonies.read",
    { id: selectedId ?? "" },
    Boolean(selectedId),
  );
  const profileState = usePodiumQuery("profiles.list", {});
  const providers = usePodiumQuery("profiles.providers", {});
  const data: SymphoniesData = {
    list: list.data,
    loading: list.loading && !list.data,
    stale: Boolean(list.error),
    detail: read.data,
    detailStale: Boolean(read.error),
  };
  const profiles: ProfilesData = {
    state: profileState.data ?? undefined,
    providers: providers.data ?? undefined,
    loading: profileState.loading,
    stale: Boolean(profileState.error),
  };
  const { refetch: refetchList } = list;
  const { refetch: refetchRead } = read;
  const refresh = useCallback(() => {
    refetchList();
    refetchRead();
  }, [refetchList, refetchRead]);
  const deleteSymphony = useCallback(
    async (symphony: StoredSymphony) => {
      await rpc.call("symphonies.delete", {
        id: symphony.id,
        version: symphony.version,
      });
      session.update({ symphonySelection: null });
      refetchList();
    },
    [rpc, session, refetchList],
  );
  const hasSelection = Boolean(state.symphonySelection);
  return (
    <div ref={measure} className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-border px-4 pt-3 pb-3 md:px-5">
        <SymphonyHeader data={data} compact={compact} refresh={refresh} />
        {(!compact || !hasSelection) && <SymphonyToolbar data={data} />}
      </div>
      <SymphonyBrowser
        data={data}
        compact={compact}
        now={now}
        profiles={profiles}
        openAgent={openAgent}
        deleteSymphony={deleteSymphony}
      />
    </div>
  );
}
