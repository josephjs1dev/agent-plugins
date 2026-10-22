import type {
  StatusColor,
  StatusIcon,
  StatusPresentation,
} from "conductor/podium/status";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/** Each core status color role as a bb text color. */
export const STATUS_TEXT: Record<StatusColor, string> = {
  foregroundMuted: "text-muted-foreground",
  accent: "text-primary",
  statusWarning: "text-amber-600 dark:text-amber-400",
  statusDanger: "text-destructive",
  statusSuccess: "text-emerald-600 dark:text-emerald-400",
};

/** Each core status color role as a bb background color. */
export const STATUS_FILL: Record<StatusColor, string> = {
  foregroundMuted: "bg-muted-foreground/40",
  accent: "bg-primary",
  statusWarning: "bg-amber-500",
  statusDanger: "bg-destructive",
  statusSuccess: "bg-emerald-500",
};

/** The core's Lucide status icons as bb icon names. */
const STATUS_ICONS: Record<StatusIcon, string> = {
  Activity: "Loading",
  Archive: "Archive",
  Bell: "BellDot",
  Circle: "Circle",
  CircleCheck: "CircleCheck",
  CirclePause: "Pause",
  CircleX: "CircleX",
  Clock3: "Clock",
  Hourglass: "TimeSchedule",
  MessageCircle: "MessageQuestion",
  RotateCcw: "RotateCcw",
};

export function StatusIconGlyph({
  icon,
  className,
}: {
  icon: StatusIcon;
  className?: string;
}) {
  return (
    <Icon
      name={STATUS_ICONS[icon]}
      fallback="Circle"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
    />
  );
}

/**
 * A visible icon plus the presentation's label. The icon is hidden from
 * assistive technology, so the text carries the accessible name.
 */
export function StatusMarker({
  presentation,
  className,
}: {
  presentation: StatusPresentation;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        STATUS_TEXT[presentation.color],
        className,
      )}
    >
      <StatusIconGlyph icon={presentation.icon} />
      {presentation.label}
    </span>
  );
}
