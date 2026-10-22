import {
  loopVerdictColor,
  loopVerdictLabel,
  type HistoryLoopGroup,
} from "conductor/podium/history";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SectionLabel } from "../ui/notice";
import { STATUS_FILL } from "../ui/status";

/** The verdict dot; redundant with the text, never color-only. */
function VerdictDot({ group }: { group: HistoryLoopGroup }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        STATUS_FILL[loopVerdictColor(group)],
      )}
    />
  );
}

/**
 * Chooses the loop the Tasks, Graph and Context tabs show. The trigger names
 * the shown loop's verdict in text, so the choice never depends on color.
 * Selecting the latest loop follows new loops as they start; an older loop
 * stays pinned and says so, with a way back. The list floats over the
 * content, closes on Escape or an outside press, and returns focus to the
 * trigger.
 */
export function LoopSelector({
  loops,
  shown,
  onSelect,
}: {
  loops: readonly HistoryLoopGroup[];
  shown: number;
  /** `null` selects the latest loop and keeps following it. */
  onSelect(this: void, loop: number | null): void;
}) {
  const latest = loops.at(-1)?.loop ?? 1;
  const current = loops.find((group) => group.loop === shown) ?? loops.at(-1);
  if (!current) {
    return null;
  }
  const triggerLabel = `Loop ${current.loop} · ${loopVerdictLabel(current)}${
    current.loop === latest ? " · latest" : ""
  }`;
  return (
    <div data-testid="loop-selector" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <SectionLabel>Loop</SectionLabel>
        <Select
          value={String(current.loop)}
          onValueChange={(value) => {
            const loop = Number(value);
            onSelect(loop === latest ? null : loop);
          }}
        >
          <SelectTrigger
            data-testid="loop-select"
            aria-label={triggerLabel}
            className="w-auto gap-2"
          >
            <span className="flex items-center gap-2">
              <VerdictDot group={current} />
              {triggerLabel}
            </span>
          </SelectTrigger>
          <SelectContent
            data-testid="loop-listbox"
            aria-label="Loops"
            className="max-w-[320px]"
          >
            {[...loops].reverse().map((group) => (
              <SelectItem
                key={group.loop}
                value={String(group.loop)}
                data-testid={`loop-option-${group.loop}`}
                textValue={`Loop ${group.loop}`}
              >
                <span className="flex items-center gap-2">
                  <VerdictDot group={group} />
                  <span
                    className={cn(
                      "truncate",
                      group.loop === current.loop && "font-semibold",
                    )}
                  >
                    {`Loop ${group.loop} · ${loopVerdictLabel(group)}`}
                  </span>
                  {group.loop === latest && (
                    <span className="text-xs text-muted-foreground">
                      latest
                    </span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {shown < latest && (
        <div className="flex flex-wrap items-center gap-2">
          <p
            data-testid="loop-past-note"
            className="text-xs leading-[17px] text-muted-foreground"
          >
            {`Showing loop ${shown} as it ended. Loop ${latest} is the latest.`}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => onSelect(null)}
          >
            Show latest loop
          </Button>
        </div>
      )}
    </div>
  );
}
