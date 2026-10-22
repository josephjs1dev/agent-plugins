import type { StoredSymphony, TaskDefinition } from "../symphonies/models";
import type { GraphEdgeLayout, GraphLayoutSummary } from "../symphonies/layout";
import { conflictReason } from "../symphonies/score";
import { taskState, type TaskStateKey } from "../symphonies/task-state";
import { identityLabel, type WorkerIdentity } from "./worker-identity";

/** Legend order follows the shared task-state projection's own set. */
export const LEGEND_ORDER: readonly TaskStateKey[] = [
  "ready",
  "waiting",
  "running",
  "blocked",
  "finishing",
  "completed",
  "needs-changes",
  "failed",
];

/** Count label helpers for the compact heading. */
export const plural = (count: number, singular: string, rest: string) =>
  `${count} ${count === 1 ? singular : rest}`;

/**
 * The worker sentence for a node's accessible label and the selection panel:
 * what actually runs versus what the plan alone names.
 */
export function workerClause(identity: WorkerIdentity): string {
  return identity.source === "launched"
    ? `Runs on ${identityLabel(identity)}`
    : `Planned: ${identityLabel(identity)}`;
}

/** "8 tasks · 5 dependency arrows · 7 shared-resource conflicts". */
export function summaryLine(summary: GraphLayoutSummary): string {
  const parts = [
    plural(summary.tasks, "task", "tasks"),
    plural(summary.dependencies, "dependency arrow", "dependency arrows"),
  ];
  if (summary.conflicts === 1) {
    parts.push("1 shared-resource conflict");
  } else if (summary.conflicts > 1) {
    parts.push(`${summary.conflicts} shared-resource conflicts`);
  }
  return parts.join(" · ");
}

/** The task states the displayed score shows, for the legend. */
export function presentTaskStates(
  symphony: StoredSymphony,
  tasks: readonly TaskDefinition[],
): TaskStateKey[] {
  return [...new Set(tasks.map((task) => taskState(symphony, task).key))];
}

/** A shared-resource conflict between the selected task and another. */
export interface GraphConflict {
  other: TaskDefinition;
  reason: string;
}

/**
 * The selected task's direct relationships: the nodes its edges or conflicts
 * touch (excluding itself), its shared-resource conflicts, and the tasks that
 * list it as a prerequisite.
 */
export function graphRelations(
  tasks: readonly TaskDefinition[],
  edges: readonly GraphEdgeLayout[],
  selected: TaskDefinition,
): {
  connected: Set<string>;
  conflicts: GraphConflict[];
  dependents: string[];
} {
  const connected = new Set<string>();
  for (const edge of edges) {
    if (edge.from === selected.id || edge.to === selected.id) {
      connected.add(edge.from);
      connected.add(edge.to);
    }
  }
  const conflicts = tasks
    .filter((other) => other.id !== selected.id)
    .flatMap((other) => {
      const reason = conflictReason(selected, other);
      return reason ? [{ other, reason }] : [];
    });
  for (const conflict of conflicts) {
    connected.add(conflict.other.id);
  }
  connected.delete(selected.id);
  const dependents = tasks
    .filter((other) => other.prerequisites.includes(selected.id))
    .map((other) => other.id);
  return { connected, conflicts, dependents };
}

/**
 * A graph node's accessible name. Activating a node selects it, so the name
 * promises selection, never navigation.
 */
export function graphNodeLabel({
  task,
  stateLabel,
  identity,
  selected,
}: {
  task: TaskDefinition;
  stateLabel: string;
  identity: WorkerIdentity | null;
  selected: boolean;
}): string {
  const waitsFor = task.prerequisites.length
    ? ` Waits for ${task.prerequisites.join(", ")}.`
    : "";
  const worker = identity?.provider ? ` ${workerClause(identity)}.` : "";
  return `${selected ? "Task" : "Select task"} ${task.id} — ${task.title}. ${stateLabel}.${waitsFor}${worker}${selected ? " Selected." : ""}`;
}

/** The selection panel's relationship lines, one per line. */
export function selectionRelationsText(
  task: TaskDefinition,
  dependents: readonly string[],
  waitingFor: readonly string[],
): string {
  return [
    task.prerequisites.length
      ? `Waits for ${task.prerequisites.join(", ")}`
      : "No dependencies",
    ...(dependents.length ? [`Needed by ${dependents.join(", ")}`] : []),
    ...(waitingFor.length ? [`Still waiting on ${waitingFor.join(", ")}`] : []),
  ].join("\n");
}
