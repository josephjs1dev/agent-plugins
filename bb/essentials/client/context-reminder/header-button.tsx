import { useState } from "react";
import {
  experimental_useSidebarThreads as useSidebarThreads,
  useBbNavigate,
  type PluginThreadHeaderActionProps,
} from "@get-bb/plugin-sdk/app";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { REMINDER_PAGE_PATH } from "../navigation";
import { HeaderTrigger } from "../usage/header-trigger";
import { ReminderCard } from "./reminder-card";
import { reminderView, useReminder } from "./state";
import { TierDot } from "./tier-dot";

const BUSY = new Set(["starting", "active", "stopping"]);

/** True while the thread's turn runs, when it cannot compact yet. */
function useThreadRunning(threadId: string): boolean {
  const { threads } = useSidebarThreads();
  const thread = threads.find((candidate) => candidate.id === threadId);
  return thread !== undefined && BUSY.has(thread.status);
}

/**
 * The thread header's Context Reminder control: the context fill, colored by
 * tier, with the reminder card and its actions in a popover. It shows once the
 * thread has a context reading, below Warn at too.
 */
export function ReminderHeaderButton({
  threadId,
  isCompactViewport,
}: PluginThreadHeaderActionProps) {
  const { state, error, pending, act } = useReminder(threadId);
  const isRunning = useThreadRunning(threadId);
  const navigate = useBbNavigate();
  const [open, setOpen] = useState(false);
  const view = reminderView(state, true);
  if (!state || !view) {
    return null;
  }
  const { reading, hasNotice, percent, status } = view;
  const label = `Context ${percent}%`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <HeaderTrigger
          icon={<TierDot tier={reading.tier} />}
          label={hasNotice ? `${label} · Reminder` : label}
          compact={isCompactViewport}
          className={hasNotice ? "border-current" : undefined}
        />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        mobileTitle="Context Reminder"
        className="w-[26rem] max-w-[calc(100vw-2rem)] p-0"
      >
        <ReminderCard
          notice={reading}
          character={state.character}
          isRunning={isRunning}
          pending={pending}
          error={error}
          snoozedUntil={state.snoozedUntil}
          status={state.snoozedUntil === null ? status : undefined}
          closeLabel={hasNotice ? "Dismiss" : null}
          className="rounded-none border-0 bg-transparent"
          onAction={(action) => {
            act(action, reading.snoozeMinutes).catch(() => undefined);
          }}
          onClose={() => {
            act("dismiss").catch(() => undefined);
            setOpen(false);
          }}
        />
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            navigate.toPluginPanel(REMINDER_PAGE_PATH);
          }}
          className="flex min-h-10 w-full items-center border-t px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Context Reminder settings
        </button>
      </PopoverContent>
    </Popover>
  );
}
