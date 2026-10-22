import { TASK_STATE_LABELS, type TaskStateKey } from "../symphonies/task-state";

/**
 * One slice of a detailed progress track, in score order. `reportedComplete`
 * mirrors the shared completion count for the list (an attempt with state
 * "completed"); display state can still read "Finishing" while the agent
 * settles, so the fill never trusts `state` alone.
 */
export interface SymphonyProgressSegment {
  id: string;
  title: string;
  state: TaskStateKey;
  reportedComplete: boolean;
}

/** The visible and accessible count line, such as "2 of 5 tasks reported complete". */
export function progressLabel(
  completedTasks: number,
  taskCount: number,
): string {
  return `${completedTasks} of ${taskCount} tasks reported complete`;
}

/** The filled share of a continuous track, clamped to [0, 1]; 0 without tasks. */
export function progressFraction(
  completedTasks: number,
  taskCount: number,
): number {
  const clamped = Math.min(Math.max(completedTasks, 0), Math.max(taskCount, 0));
  return taskCount > 0 ? Math.min(clamped / taskCount, 1) : 0;
}

/** The accessible name of one track slice. */
export function segmentLabel(segment: SymphonyProgressSegment): string {
  return `${segment.title}: ${
    segment.reportedComplete
      ? "reported complete"
      : TASK_STATE_LABELS[segment.state]
  }`;
}
