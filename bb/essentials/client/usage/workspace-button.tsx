import { useState } from "react";
import type { PluginThreadHeaderActionProps } from "@get-bb/plugin-sdk/app";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ICONS } from "../../shared/icons";
import { HeaderTrigger } from "./header-trigger";
import { WorkspaceUsage } from "./workspace-usage";

/** The thread header's control for its environment's token usage. */
export function WorkspaceUsageButton({
  threadId,
  isCompactViewport,
}: PluginThreadHeaderActionProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <HeaderTrigger
          icon={ICONS.chart}
          label="Workspace usage"
          compact={isCompactViewport}
        />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        mobileTitle="Workspace usage"
        className="max-h-[min(40rem,80vh)] w-[30rem] max-w-[calc(100vw-2rem)] overflow-y-auto"
      >
        {open && (
          <WorkspaceUsage threadId={threadId} onClose={() => setOpen(false)} />
        )}
      </PopoverContent>
    </Popover>
  );
}
