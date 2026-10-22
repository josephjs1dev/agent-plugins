import type {
  StoredSymphony,
  SymphonyContext,
} from "conductor/symphonies/models";
import type { ProfilesState } from "conductor/symphonies/profiles";
import type { ProviderCatalog } from "conductor/symphonies/profiles-contracts";
import {
  isSymphonyListFiltered,
  symphonyGroups,
  visibleSymphonies,
} from "conductor/podium/symphony-list";
import type { Output } from "../data";
import { usePodium, useViewState } from "../podium/context";
import { Notice, SectionLabel } from "../ui/notice";
import { SymphonyDetail } from "./detail";
import { SymphonyRow } from "./row";

export interface SymphoniesData {
  list: Output<"symphonies.list"> | null;
  loading: boolean;
  stale: boolean;
  detail: { symphony: StoredSymphony; context: SymphonyContext } | null;
  detailStale: boolean;
}

/** Worker profiles and the provider catalog, for worker identity labels. */
export interface ProfilesData {
  state: ProfilesState | undefined;
  providers: ProviderCatalog | undefined;
  loading: boolean;
  stale: boolean;
}

export function SymphonyRows({
  data,
  now,
}: {
  data: SymphoniesData;
  now: number;
}) {
  const { session } = usePodium();
  const state = useViewState();
  const symphonies = visibleSymphonies(data.list?.symphonies ?? [], state);
  const filtered = isSymphonyListFiltered(state);
  return (
    <div className="space-y-4">
      {data.loading && <Notice>Loading symphonies…</Notice>}
      {data.stale && (
        <Notice warning>
          Symphony storage could not refresh. Showing last known symphonies;
          native requests are independent.
        </Notice>
      )}
      {Boolean(data.list?.unavailable || data.list?.incomplete) && (
        <Notice warning>
          Symphony coverage is incomplete. {data.list?.unavailable ?? 0} records
          could not be read. Other symphonies and native requests remain
          accessible.
        </Notice>
      )}
      {!data.loading && !data.stale && !symphonies.length && (
        <div className="space-y-2 p-4">
          <p className="text-base font-medium text-foreground">
            {filtered ? "No matching symphonies" : "No symphonies yet"}
          </p>
          <p className="text-sm text-muted-foreground">
            {filtered
              ? "Clear your search or choose All."
              : "A symphony is one task orchestration: the Conductor writes a score, splits it into tasks, and dispatches a task agent to each. Ask your agent to track the work in Conductor to create one."}
          </p>
        </div>
      )}
      {symphonyGroups(symphonies).map(({ label, entries }) => (
        <section key={label} aria-label={label} className="space-y-1.5">
          <div className="px-2">
            <SectionLabel>{label}</SectionLabel>
          </div>
          <ul className="space-y-1.5">
            {entries.map((symphony) => (
              <li key={symphony.id}>
                <SymphonyRow
                  symphony={symphony}
                  now={now}
                  selected={state.symphonySelection?.id === symphony.id}
                  onSelect={() =>
                    session.update({
                      section: "symphonies",
                      symphonySelection: { kind: "symphony", id: symphony.id },
                    })
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function SymphonySelectionDetail({
  data,
  compact,
  openAgent,
  deleteSymphony,
  profiles,
}: {
  data: SymphoniesData;
  compact: boolean;
  openAgent?: (id: string) => void;
  deleteSymphony?: (symphony: StoredSymphony) => Promise<void>;
  profiles?: ProfilesData;
}) {
  const { symphonySelection: selection } = useViewState();
  if (!selection) {
    return null;
  }
  if (!data.detail || data.detail.symphony.id !== selection.id) {
    return (
      <div className="p-6">
        <Notice warning={data.detailStale}>
          {data.detailStale
            ? "This symphony could not be read. Refresh or choose another item; native requests remain available."
            : "Loading symphony history…"}
        </Notice>
      </div>
    );
  }
  return (
    <SymphonyDetail
      key={selection.id}
      symphony={data.detail.symphony}
      context={data.detail.context}
      stale={data.detailStale}
      compact={compact}
      {...(profiles ? { profiles } : {})}
      {...(openAgent ? { openAgent } : {})}
      {...(deleteSymphony ? { deleteSymphony } : {})}
    />
  );
}
