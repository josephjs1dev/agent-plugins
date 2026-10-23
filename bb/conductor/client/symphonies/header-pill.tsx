import { useState } from "react";
import {
  useBbNavigate,
  type PluginThreadHeaderActionProps,
} from "@get-bb/plugin-sdk/app";
import { ongoingIcon, ongoingLabel } from "conductor/podium/ongoing";
import {
  symphonyStatusPresentation,
  type StatusIcon,
} from "conductor/podium/status";
import type { SymphonyListEntry } from "conductor/symphonies/models";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { usePodiumQuery } from "../data";
import { PODIUM_PATH, symphonySubPath } from "../podium/links";
import { StatusIconGlyph, StatusMarker } from "../ui/status";

const PILL_TITLE = "Ongoing symphonies";

/**
 * One ongoing symphony in the popover: its status and environment, title,
 * reported-task line, and latest message or blocker.
 */
function PillEntry({
  symphony,
  onOpen,
}: {
  symphony: SymphonyListEntry;
  onOpen(this: void): void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-state-hover focus-visible:bg-state-hover"
    >
      <span className="flex w-full items-center justify-between gap-2.5">
        <StatusMarker
          presentation={symphonyStatusPresentation(symphony.status)}
        />
        <span className="truncate text-xs text-muted-foreground">
          {symphony.source.concertName}
        </span>
      </span>
      <span className="line-clamp-2 text-sm font-semibold text-foreground">
        {symphony.title}
      </span>
      <span className="text-xs text-muted-foreground">
        {symphony.status === "planning"
          ? "Splitting into tasks"
          : `${symphony.completedTasks} of ${symphony.taskCount} tasks reported complete`}
      </span>
      {symphony.message && (
        <span className="line-clamp-2 text-xs text-muted-foreground">
          {symphony.message}
        </span>
      )}
    </button>
  );
}

/**
 * The thread header pill of a Conductor thread with ongoing symphonies, as
 * Paseo's composer pill. It renders nothing for other threads. An entry opens
 * its symphony in the Podium.
 */
export function SymphoniesHeaderPill({
  threadId,
  isCompactViewport,
}: PluginThreadHeaderActionProps) {
  const [open, setOpen] = useState(false);
  const navigate = useBbNavigate();
  const { data } = usePodiumQuery("symphonies.ongoing", { threadId });
  const symphonies = data?.symphonies ?? [];
  if (!symphonies.length) {
    return null;
  }
  const label = ongoingLabel(symphonies);
  // The core's ongoing icons are symphony status icons.
  const icon = ongoingIcon(symphonies) as StatusIcon;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${PILL_TITLE}: ${label}`}
          title={label}
          className={cn(
            "inline-flex h-7 max-w-64 items-center gap-1.5 self-center rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-state-hover hover:text-foreground data-[state=open]:bg-state-active data-[state=open]:text-foreground",
            isCompactViewport && "w-7 justify-center px-0",
          )}
        >
          <StatusIconGlyph icon={icon} />
          {!isCompactViewport && <span className="truncate">{label}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        mobileTitle={PILL_TITLE}
        className="w-80 max-w-[calc(100vw-2rem)] p-1"
      >
        <div className="flex flex-col gap-1">
          {symphonies.map((symphony) => (
            <PillEntry
              key={symphony.id}
              symphony={symphony}
              onOpen={() => {
                setOpen(false);
                navigate.toPluginPanel(PODIUM_PATH, {
                  subPath: symphonySubPath(symphony.id),
                });
              }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
