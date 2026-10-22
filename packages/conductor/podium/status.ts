import type { AgentItem } from "../agents/models";
import { type StoredSymphony, symphonyStatusLabel } from "../symphonies/models";
import type { TaskDisplayState, TaskStateKey } from "../symphonies/task-state";

/** The Lucide icon names a status can show; each host maps them to its icons. */
export type StatusIcon =
  | "Activity"
  | "Archive"
  | "Bell"
  | "Circle"
  | "CircleCheck"
  | "CirclePause"
  | "CircleX"
  | "Clock3"
  | "Hourglass"
  | "MessageCircle"
  | "RotateCcw";

/**
 * Semantic presentation of a status: which Lucide icon to show, which theme
 * color role to use, and the visible label. The label always wins the
 * accessibility name; the icon is decorative.
 */
export interface StatusPresentation {
  label: string;
  icon: StatusIcon;
  color: StatusColor;
}

/**
 * A theme color role. Each host resolves the role against its own theme, so
 * presentation only carries the role, never a literal color value.
 */
export type StatusColor =
  | "foregroundMuted"
  | "accent"
  | "statusWarning"
  | "statusDanger"
  | "statusSuccess";

/**
 * Task states present exactly the projection labels produced by
 * `taskState` in `shared/symphonies/task-state.ts`, never a stronger word
 * (a settling completed attempt stays "Finishing").
 */
export const TASK_ICONS: Record<TaskStateKey, StatusPresentation["icon"]> = {
  ready: "Circle",
  waiting: "Clock3",
  running: "Activity",
  blocked: "CirclePause",
  finishing: "Hourglass",
  completed: "CircleCheck",
  "needs-changes": "RotateCcw",
  failed: "CircleX",
};

export /** The theme color role for each task state. */
const TASK_STATE_COLORS: Record<TaskStateKey, StatusColor> = {
  ready: "foregroundMuted",
  waiting: "foregroundMuted",
  running: "accent",
  blocked: "statusWarning",
  finishing: "statusWarning",
  "needs-changes": "statusWarning",
  completed: "statusSuccess",
  failed: "statusDanger",
};

/** Presentation for a task display projection from `taskState`. */
export function taskStatusPresentation(
  state: TaskDisplayState,
): StatusPresentation {
  return {
    label: state.label,
    icon: TASK_ICONS[state.key],
    color: TASK_STATE_COLORS[state.key],
  };
}

/**
 * A completed symphony only ever reads "Complete" as claimed by
 * `symphonyStatusLabel`; an idle agent never borrows that treatment. The
 * labels stay the shared label authority's own words.
 */
export const SYMPHONY_PRESENTATION: Record<
  StoredSymphony["status"],
  Omit<StatusPresentation, "label">
> = {
  planning: { icon: "Clock3", color: "foregroundMuted" },
  ready: { icon: "Circle", color: "foregroundMuted" },
  running: { icon: "Activity", color: "accent" },
  blocked: { icon: "CirclePause", color: "statusWarning" },
  completed: { icon: "CircleCheck", color: "statusSuccess" },
  failed: { icon: "CircleX", color: "statusDanger" },
};

/** Presentation for a symphony status; labels come from `symphonyStatusLabel`. */
export function symphonyStatusPresentation(
  status: StoredSymphony["status"],
): StatusPresentation {
  return {
    label: symphonyStatusLabel(status),
    ...SYMPHONY_PRESENTATION[status],
  };
}

/** Agent bucket presentation; closed and idle never read as Completed. */
export const AGENT_BUCKET_PRESENTATION: Record<
  AgentItem["bucket"],
  Omit<StatusPresentation, "label">
> = {
  waiting: { icon: "Clock3", color: "statusWarning" },
  failed: { icon: "CircleX", color: "statusDanger" },
  running: { icon: "Activity", color: "accent" },
  closed: { icon: "Archive", color: "foregroundMuted" },
  idle: { icon: "Circle", color: "foregroundMuted" },
};

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Presentation for a queued agent item. A marked reminder or an open request
 * outranks the bucket so the icon points at the action the user can take,
 * not just the agent's state.
 */
export function agentStatusPresentation(
  item: Pick<AgentItem, "bucket" | "requestId" | "marked">,
): StatusPresentation {
  if (item.marked) {
    return { label: "Manual reminder", icon: "Bell", color: "statusWarning" };
  }
  if (item.requestId) {
    return {
      label: "Needs answer",
      icon: "MessageCircle",
      color: "statusWarning",
    };
  }
  return {
    label: capitalize(item.bucket),
    ...AGENT_BUCKET_PRESENTATION[item.bucket],
  };
}
