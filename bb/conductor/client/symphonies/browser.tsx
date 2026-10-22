import type { StoredSymphony } from "conductor/symphonies/models";
import { cn } from "@/lib/utils";
import { useViewState } from "../podium/context";
import { SectionLabel } from "../ui/notice";
import {
  SymphonyRows,
  SymphonySelectionDetail,
  type ProfilesData,
  type SymphoniesData,
} from "./list";

/**
 * The symphony list beside the selected symphony. A compact pane shows one
 * side at a time: the list, or the selection.
 */
export function SymphonyBrowser({
  data,
  compact,
  now,
  openAgent,
  deleteSymphony,
  profiles,
}: {
  data: SymphoniesData;
  compact: boolean;
  now: number;
  openAgent?: (id: string) => void;
  deleteSymphony?: (symphony: StoredSymphony) => Promise<void>;
  profiles?: ProfilesData;
}) {
  const hasSelection = Boolean(useViewState().symphonySelection);
  return (
    <div
      className={cn("flex min-h-0 flex-1", compact ? "flex-col" : "flex-row")}
    >
      {(!compact || !hasSelection) && (
        <div
          aria-label="Symphonies"
          role="region"
          className={cn(
            "min-h-0 overflow-y-auto p-3.5",
            compact ? "flex-1" : "w-[39%] shrink-0 border-r border-border",
          )}
        >
          <SymphonyRows data={data} now={now} />
        </div>
      )}
      {(!compact || hasSelection) && (
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {hasSelection ? (
            <SymphonySelectionDetail
              data={data}
              compact={compact}
              {...(profiles ? { profiles } : {})}
              {...(openAgent ? { openAgent } : {})}
              {...(deleteSymphony ? { deleteSymphony } : {})}
            />
          ) : (
            <div className="max-w-[620px] space-y-2.5 p-7">
              <SectionLabel>Symphony progress</SectionLabel>
              <p className="text-xl text-foreground">
                Choose a symphony to follow.
              </p>
              <p className="text-sm text-muted-foreground">
                Follow tasks, blockers, and reported results. Open the source
                agent when a decision needs your input.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
