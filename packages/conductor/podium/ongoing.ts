import {
  type StoredSymphony,
  type SymphonyListEntry,
  symphonyStatusLabel,
} from "../symphonies/models";

/** A symphony is ongoing while it plans, waits, runs, or needs attention. */
export const ONGOING_STATUSES: ReadonlySet<StoredSymphony["status"]> = new Set([
  "planning",
  "ready",
  "running",
  "blocked",
]);

/** Lucide names; they mirror the symphony icons in `./status`. */
export const ONGOING_ICON = "Activity";

export const ONGOING_ATTENTION_ICON = "CirclePause";

export const ONGOING_ATTENTION_LABEL = symphonyStatusLabel("blocked");

export interface OngoingGroup {
  /** The first group member's concert, where the group is shown. */
  readonly workspaceId: string;
  readonly symphonies: SymphonyListEntry[];
}

/** Label for one agent's ongoing symphonies: a count, attention first. */
export function ongoingCountLabel(
  symphonies: readonly SymphonyListEntry[],
): string {
  const only = symphonies[0];
  if (symphonies.length === 1 && only) {
    return `Symphony ${only.completedTasks}/${only.taskCount}`;
  }
  return `${symphonies.length} symphonies`;
}

/** The visible label: the attention status when any is blocked, else the count. */
export function ongoingLabel(symphonies: readonly SymphonyListEntry[]): string {
  const blocked = ongoingIcon(symphonies) === ONGOING_ATTENTION_ICON;
  return blocked ? ONGOING_ATTENTION_LABEL : ongoingCountLabel(symphonies);
}

/** The attention icon when any symphony is blocked, else the running icon. */
export function ongoingIcon(symphonies: readonly SymphonyListEntry[]): string {
  return symphonies.some((symphony) => symphony.status === "blocked")
    ? ONGOING_ATTENTION_ICON
    : ONGOING_ICON;
}

/** Groups ongoing symphonies by Conductor agent, in list order. */
export function ongoingGroups(
  symphonies: readonly SymphonyListEntry[],
  agentIds: ReadonlySet<string>,
): Map<string, OngoingGroup> {
  const groups = new Map<string, OngoingGroup>();
  for (const symphony of symphonies) {
    if (!ONGOING_STATUSES.has(symphony.status)) {
      continue;
    }
    const agentId = symphony.source.agentId;
    // Symphonies without a Conductor agent belong to no group.
    if (agentId === null || !agentIds.has(agentId)) {
      continue;
    }
    const group = groups.get(agentId);
    if (group) {
      group.symphonies.push(symphony);
    } else {
      groups.set(agentId, {
        workspaceId: symphony.source.concertId,
        symphonies: [symphony],
      });
    }
  }
  return groups;
}
