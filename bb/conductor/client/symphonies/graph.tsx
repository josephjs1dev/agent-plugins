import { useMemo, useState } from "react";
import {
  latestAttempt,
  type StoredSymphony,
  type TaskDefinition,
} from "conductor/symphonies/models";
import {
  GRAPH_ARROW,
  GRAPH_LINE,
  graphGeometry,
  layoutGraph,
  type GraphEdgeLayout,
  type GraphNodeLayout,
} from "conductor/symphonies/layout";
import type { ConductorProfile } from "conductor/symphonies/profiles";
import type { ProviderCatalog } from "conductor/symphonies/profiles-contracts";
import {
  TASK_STATE_LABELS,
  taskState,
  type TaskStateKey,
} from "conductor/symphonies/task-state";
import {
  LEGEND_ORDER,
  graphNodeLabel,
  graphRelations,
  presentTaskStates,
  selectionRelationsText,
  summaryLine,
  workerClause,
  type GraphConflict,
} from "conductor/podium/graph";
import {
  TASK_ICONS,
  TASK_STATE_COLORS,
  taskStatusPresentation,
} from "conductor/podium/status";
import { taskIdentity } from "conductor/podium/worker-identity";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { HarnessMark } from "../ui/harness-mark";
import { STATUS_TEXT, StatusIconGlyph, StatusMarker } from "../ui/status";

/**
 * Unrelated edges fade to this opacity while a node is selected: still
 * visible, but clearly out of the selected relationship.
 */
const EDGE_DIM_OPACITY = 0.3;

/**
 * Solid muted arrows are directed prerequisites; dashed amber connectors are
 * shared-resource conflicts. A selected node's direct prerequisite edges use
 * the accent, and every unrelated edge fades.
 */
function Edge({
  edge,
  highlighted,
  dim,
}: {
  edge: GraphEdgeLayout;
  highlighted: boolean;
  dim: boolean;
}) {
  let color = "text-muted-foreground";
  if (edge.kind === "conflict") {
    color = "text-amber-500";
  } else if (highlighted) {
    color = "text-primary";
  }
  const tip = edge.points.at(-1);
  return (
    <g className={color} opacity={dim ? EDGE_DIM_OPACITY : 1}>
      <polyline
        points={edge.points.map((point) => `${point.x},${point.y}`).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth={GRAPH_LINE}
        strokeDasharray={edge.kind === "conflict" ? "5 4" : undefined}
      />
      {edge.kind === "dependency" && tip && (
        <polygon
          points={`${tip.x - GRAPH_ARROW},${tip.y - 5} ${tip.x},${tip.y} ${tip.x - GRAPH_ARROW},${tip.y + 5}`}
          fill="currentColor"
        />
      )}
    </g>
  );
}

/**
 * One task node: the ID with the worker's model, a two-line title, and the
 * status icon and label. Activating a node selects it for inspection; opening
 * the agent is a separate action in the selection panel.
 */
function GraphNode({
  task,
  symphony,
  node,
  padding,
  selected,
  connected,
  profiles,
  catalog,
  onPick,
}: {
  task: TaskDefinition;
  symphony: StoredSymphony;
  node: GraphNodeLayout;
  padding: number;
  selected: boolean;
  connected: boolean;
  profiles: readonly ConductorProfile[];
  catalog: ProviderCatalog | undefined;
  onPick(this: void): void;
}) {
  const state = taskState(symphony, task);
  const presentation = taskStatusPresentation(state);
  const identity = taskIdentity(symphony, task, profiles, catalog);
  return (
    <button
      type="button"
      aria-label={graphNodeLabel({
        task,
        stateLabel: presentation.label,
        identity,
        selected,
      })}
      aria-pressed={selected}
      onClick={onPick}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        padding,
      }}
      className={cn(
        "absolute flex flex-col gap-1 overflow-hidden rounded-[10px] text-left",
        "focus-visible:border-2 focus-visible:border-primary focus-visible:outline-none",
        selected
          ? "border-2 border-primary bg-state-active"
          : "border bg-background hover:bg-state-hover",
        !selected && (connected ? "border-primary" : "border-border"),
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
        <span className="min-w-0 shrink truncate">{task.id}</span>
        {identity?.provider && (
          <span className="ml-auto flex max-w-[55%] min-w-0 items-center gap-1">
            <HarnessMark
              provider={identity.provider}
              {...(identity.providerLabel
                ? { label: identity.providerLabel }
                : {})}
              className="size-3"
            />
            <span className="truncate">
              {identity.modelLabel ?? identity.providerLabel}
            </span>
          </span>
        )}
      </span>
      <span className="line-clamp-2 text-sm font-medium text-foreground">
        {task.title}
      </span>
      <span
        className={cn(
          "flex min-w-0 items-center gap-1.5 text-xs font-semibold",
          STATUS_TEXT[presentation.color],
        )}
      >
        <StatusIconGlyph icon={presentation.icon} className="size-3.5" />
        <span className="truncate">
          {presentation.label}
          {state.waitingFor.length ? ` · ${state.waitingFor.join(", ")}` : ""}
        </span>
      </span>
    </button>
  );
}

/**
 * Status chips for the states the displayed score shows, plus the two
 * connector meanings. Written labels keep states readable without color.
 */
function Legend({ present }: { present: readonly TaskStateKey[] }) {
  return (
    <ul
      aria-label="Graph legend"
      className="flex flex-wrap gap-3 text-xs text-muted-foreground"
    >
      {LEGEND_ORDER.filter((state) => present.includes(state)).map((state) => (
        <li key={state} className="flex items-center gap-1.5">
          <StatusIconGlyph
            icon={TASK_ICONS[state]}
            className={cn("size-3.5", STATUS_TEXT[TASK_STATE_COLORS[state]])}
          />
          <span className="text-foreground">{TASK_STATE_LABELS[state]}</span>
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="w-[18px] border-t-2 border-muted-foreground"
        />
        prerequisite
      </li>
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="w-[18px] border-t-2 border-dashed border-amber-500"
        />
        shared resource
      </li>
    </ul>
  );
}

/**
 * The selected task's panel: title, state, worker, direct prerequisites and
 * dependents, conflicts, and an explicit Open agent action when the launch
 * did not fail.
 */
function SelectionPanel({
  symphony,
  task,
  dependents,
  conflicts,
  profiles,
  catalog,
  openAgent,
}: {
  symphony: StoredSymphony;
  task: TaskDefinition;
  dependents: readonly string[];
  conflicts: readonly GraphConflict[];
  profiles: readonly ConductorProfile[];
  catalog: ProviderCatalog | undefined;
  openAgent?: (id: string) => void;
}) {
  const attempt = latestAttempt(symphony, task.id);
  const state = taskState(symphony, task);
  const identity = taskIdentity(symphony, task, profiles, catalog);
  const agentId =
    attempt && attempt.launch?.state !== "failed" ? attempt.agentId : null;
  return (
    <section
      aria-label={`Selected task ${task.id}`}
      className="space-y-2 rounded-[10px] border border-border bg-muted/30 p-3.5"
    >
      <p className="text-sm font-semibold text-foreground">
        {`Selected ${task.id}: ${task.title}`}
      </p>
      <StatusMarker presentation={taskStatusPresentation(state)} />
      <div className="space-y-0.5 text-xs whitespace-pre-line text-muted-foreground">
        {identity?.provider && <p>{`${workerClause(identity)}.`}</p>}
        <p>{selectionRelationsText(task, dependents, state.waitingFor)}</p>
        {conflicts.map((conflict) => (
          <p key={conflict.other.id}>
            {`Conflict with ${conflict.other.id}: ${conflict.reason} — their work is serialized without adding a prerequisite.`}
          </p>
        ))}
      </div>
      {openAgent && agentId && (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Open agent · ${task.id}`}
          onClick={() => openAgent(agentId)}
        >
          <Icon name="ExternalLink" aria-hidden />
          Open agent
        </Button>
      )}
      {openAgent && attempt?.launch?.state === "failed" && (
        <p className="text-xs text-muted-foreground">
          The last agent launch failed; there is no agent to open.
        </p>
      )}
    </section>
  );
}

/**
 * The symphony score as an inspectable graph. Selecting a node highlights its
 * direct edges and summarizes it below the canvas. The selection clears when
 * the displayed score stops containing the picked task, so a pick never leaks
 * across loops or symphonies.
 */
export function ScoreView({
  symphony,
  score,
  openAgent,
  compact = false,
  profiles,
  catalog,
}: {
  symphony: StoredSymphony;
  score: { tasks: TaskDefinition[] };
  openAgent?: (id: string) => void;
  compact?: boolean;
  /** Worker profiles for node identity resolution; empty while unloaded. */
  profiles?: readonly ConductorProfile[] | undefined;
  catalog?: ProviderCatalog | undefined;
}) {
  const tasks = useMemo(
    () => new Map(score.tasks.map((task) => [task.id, task])),
    [score],
  );
  // A refresh keeps the same symphony and task IDs, so it keeps the pick.
  const pickKey = `${symphony.id}:${score.tasks.map((task) => task.id).join(",")}`;
  const [picked, setPicked] = useState<{
    symphonyId: string;
    taskId: string;
  } | null>(null);
  const [pickedKey, setPickedKey] = useState(pickKey);
  if (pickedKey !== pickKey) {
    setPickedKey(pickKey);
    setPicked(
      picked?.symphonyId === symphony.id && tasks.has(picked.taskId)
        ? picked
        : null,
    );
  }
  const layout = useMemo(() => layoutGraph(score, compact), [score, compact]);
  const geometry = graphGeometry(compact);
  const presentStates = useMemo(
    () => presentTaskStates(symphony, score.tasks),
    [score, symphony],
  );
  if (!score.tasks.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No tasks were recorded for this symphony yet.
      </p>
    );
  }
  const selected = picked ? tasks.get(picked.taskId) : undefined;
  const relations = selected
    ? graphRelations(score.tasks, layout.edges, selected)
    : null;
  return (
    <div className="space-y-2.5">
      <p className="text-xs text-muted-foreground tabular-nums">
        {summaryLine(layout.summary)}
      </p>
      <div
        className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-0.5"
        style={{ maxWidth: layout.width + 4 }}
      >
        <div
          className="relative"
          style={{ width: layout.width, height: layout.height }}
        >
          <svg
            aria-hidden
            width={layout.width}
            height={layout.height}
            className="pointer-events-none absolute inset-0"
          >
            {layout.edges.map((edge, index) => {
              const touches =
                Boolean(selected) &&
                (edge.from === selected?.id || edge.to === selected?.id);
              return (
                <Edge
                  key={`${edge.from}->${edge.to}:${index}`}
                  edge={edge}
                  highlighted={touches}
                  dim={Boolean(selected) && !touches}
                />
              );
            })}
          </svg>
          {layout.nodes.map((node) => {
            const task = tasks.get(node.taskId);
            if (!task) {
              return null;
            }
            return (
              <GraphNode
                key={node.taskId}
                task={task}
                symphony={symphony}
                node={node}
                padding={geometry.nodePadding}
                selected={selected?.id === task.id}
                connected={relations?.connected.has(task.id) ?? false}
                profiles={profiles ?? []}
                catalog={catalog}
                onPick={() =>
                  setPicked({ symphonyId: symphony.id, taskId: task.id })
                }
              />
            );
          })}
        </div>
      </div>
      <Legend present={presentStates} />
      {selected && relations && (
        <SelectionPanel
          symphony={symphony}
          task={selected}
          dependents={relations.dependents}
          conflicts={relations.conflicts}
          profiles={profiles ?? []}
          catalog={catalog}
          {...(openAgent ? { openAgent } : {})}
        />
      )}
    </div>
  );
}
