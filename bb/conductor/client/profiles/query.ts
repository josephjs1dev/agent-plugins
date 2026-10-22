import { useRef, useState } from "react";
import type {
  ProfileDraft,
  ProfileOperation,
  ProfilesState,
  SaveProfilesResult,
} from "conductor/symphonies/profiles";
import type { ProviderCatalog } from "conductor/symphonies/profiles-contracts";
import type { RoutingMode } from "conductor/symphonies/routing";
import { usePodiumQuery, usePodiumRpc } from "../data";

/**
 * The Conductor worker profiles plus the actions their editor takes. bb has
 * no Paseo agent profiles, so the Paseo import and sync actions are absent.
 */
export interface ProfilesData {
  state: ProfilesState | undefined;
  loading: boolean;
  stale: boolean;
  providers: ProviderCatalog | undefined;
  /**
   * Creates or replaces one profile against the revision the caller's draft
   * was based on; a rejected save reports status "stale". Pass the revision
   * the draft was opened with, not the latest one, so a background refresh
   * cannot silently overwrite someone else's newer changes.
   */
  save(
    this: void,
    draft: ProfileDraft,
    expectedRevision: string,
  ): Promise<SaveProfilesResult>;
  /** Deletes one profile against the draft's base revision. */
  remove(
    this: void,
    id: string,
    expectedRevision: string,
  ): Promise<SaveProfilesResult>;
  /** Sets the global routing enforcement mode. */
  setMode(
    this: void,
    mode: RoutingMode,
    expectedRevision: string,
  ): Promise<SaveProfilesResult>;
  /** Reloads the profiles and resolves the fresh store state. */
  refresh(this: void): Promise<ProfilesState | undefined>;
}

/**
 * Loads the profiles and the provider catalog and exposes the mutations.
 * A mutation's result carries the full store state; it is shown until the
 * list query next changes, so the editor sees its own write at once.
 */
export function useProfiles(): ProfilesData {
  const rpc = usePodiumRpc();
  const list = usePodiumQuery("profiles.list", {});
  const catalog = usePodiumQuery("profiles.providers", {});
  const [written, setWritten] = useState<{
    base: ProfilesState | null;
    state: ProfilesState;
  } | null>(null);
  const latest = useRef(list.data);
  latest.current = list.data;
  const keep = (state: ProfilesState): void =>
    setWritten({ base: latest.current, state });
  const commit = async (
    operation: ProfileOperation,
    expectedRevision: string,
  ): Promise<SaveProfilesResult> => {
    if (!expectedRevision) {
      throw new Error("Profiles are still loading. Try again.");
    }
    const result = await rpc.call("profiles.save", {
      expectedRevision,
      operation,
    });
    keep(result.state);
    return result;
  };
  const state =
    written && written.base === list.data
      ? written.state
      : (list.data ?? undefined);
  return {
    state,
    loading: list.loading && !list.data,
    stale: list.error !== null,
    providers: catalog.data ?? undefined,
    save: (draft, expectedRevision) =>
      commit({ kind: "upsert", profile: draft }, expectedRevision),
    remove: (id, expectedRevision) =>
      commit({ kind: "delete", id }, expectedRevision),
    setMode: (mode, expectedRevision) =>
      commit({ kind: "mode", mode }, expectedRevision),
    refresh: async () => {
      const fresh = await rpc.call("profiles.list", {});
      keep(fresh);
      catalog.refetch();
      return fresh;
    },
  };
}
