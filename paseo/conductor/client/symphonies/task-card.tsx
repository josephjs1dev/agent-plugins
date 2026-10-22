import { useState } from "react";
import { Text, View } from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { taskState } from "conductor/symphonies/task-state";
import type { PluginTheme } from "@getpaseo/plugin";
import {
  taskAttempts,
  type Attempt,
  type GrantedWrite,
  type StoredSymphony,
  type TaskDefinition,
} from "conductor/symphonies/models";
import { attemptLoop } from "conductor/symphonies/score";
import {
  routingDisclosureLabel,
  taskCardFacts,
  workerLine,
  writesDisclosureLabel,
} from "conductor/podium/task-card";
import { taskMetrics } from "conductor/symphonies/metrics";
import type {
  AttemptRouting,
  RoutingWarning,
} from "conductor/symphonies/routing";
import {
  overrideLine,
  routingLine,
  warningLine,
} from "conductor/podium/routing";
import { Button, Disclosure, Notice } from "../ui/controls";
import {
  formatDuration,
  tokenTotalsLabel,
  workTotalsLabel,
} from "conductor/podium/labels";
import { HarnessMark } from "../ui/harness-mark";
import { RoleChip } from "../ui/role-chip";
import { cardSurface } from "../ui/card";
import { statusColor } from "../ui/status";
import { taskStatusPresentation } from "conductor/podium/status";
import { identityLabel, taskIdentity } from "conductor/podium/worker-identity";
import type { ConductorProfile } from "conductor/symphonies/profiles";
import type { ProviderCatalog } from "../../shared/symphonies/profiles-rpc";
import {
  FindingsPanel,
  InsetPanel,
  PROSE_WIDTH,
  ReportFooter,
  type ReportRouting,
} from "./task-report";
import {
  addedWritesFor,
  failedChecks as reportFailedChecks,
  instructionLines,
} from "conductor/podium/report";

/**
 * Which details a card currently reveals. Owned by SymphonyDetail so state survives
 * ordinary symphony refreshes and resets when the symphony identity changes.
 */
export interface TaskDisclosures {
  readonly summary?: boolean;
  readonly instructions?: boolean;
  readonly evidence?: boolean;
  readonly checks?: boolean;
}

/**
 * A card's independently toggled details. Evidence and Checks are exclusive:
 * at most one inset panel is open per card, while the summary and instructions
 * toggles stay independent.
 */
export type TaskDisclosure = "summary" | "instructions" | "evidence" | "checks";

/**
 * True when the summary may overflow the three-line clamp on a wide pane,
 * since React Native offers no reliable truncation callback across renderers.
 * At three visual lines of roughly 100 characters, a summary past this length
 * clamps even at full prose width; occasional false positives only reveal
 * text the reader already saw. Compact panes never depend on this estimate.
 */
function summaryMayClamp(summary: string): boolean {
  return summary.length > 240 || summary.includes("\n");
}

/**
 * One trimmed task record: wrapping title with the agent action, a worker row
 * (harness mark plus model and thinking, beside the task's role chip), a
 * metadata row led by the shared status icon and label, a three-line summary
 * clamp, and a quieter footer that keeps Evidence and Checks behind one inset
 * panel. Blocker messages and failed checks stay visible without expanding
 * anything.
 */
export function SymphonyTaskCard({
  theme,
  symphony,
  task,
  profiles,
  catalog,
  compact = false,
  disclosures,
  onToggle,
  loop,
  openAgent,
}: {
  theme: PluginTheme;
  symphony: StoredSymphony;
  task: TaskDefinition;
  /** Worker profiles for identity resolution; empty while profiles load. */
  profiles: readonly ConductorProfile[];
  /** The provider catalog behind the worker line's display labels. */
  catalog: ProviderCatalog | undefined;
  compact?: boolean;
  disclosures?: TaskDisclosures;
  onToggle?: (selection: TaskDisclosure) => void;
  /** The loop being viewed, when the symphony has several. */
  loop?: number;
  openAgent?: (id: string) => void;
}) {
  const {
    attempt,
    carriedFrom,
    agentAttempts,
    routing: cardRouting,
    worker: cardWorker,
    hasAgent,
  } = taskCardFacts(symphony, task, loop);
  const launch = attempt?.launch;
  const state = taskState(symphony, task);
  const presentation = taskStatusPresentation(state);
  const report = attempt?.report ?? null;
  const failedChecks = report ? reportFailedChecks(report) : [];
  const grantedWrites = attempt?.grantedWrites ?? [];
  const addedWrites = addedWritesFor(symphony, task.id);
  // Summed work time, elapsed span, and tokens over every attempt of the
  // task, including retries on other agents and earlier loops.
  const metrics = taskMetrics(taskAttempts(symphony, task.id), Date.now());
  // The worker line and the task card share the graph's resolution order: an
  // unresolvable worker leaves the row out instead of naming a placeholder.
  const identity = taskIdentity(symphony, task, profiles, catalog);
  const worker = identity?.provider
    ? {
        provider: identity.provider,
        line: workerLine(identity),
      }
    : null;
  const role = task.worker.role;
  const canOpenAgent = Boolean(openAgent && hasAgent);
  return (
    <View
      testID={`symphony-task-${task.id}`}
      style={{
        ...cardSurface(theme),
        gap: 8,
        padding: compact ? 12 : 16,
        borderColor: theme.colors.border,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <Text
          accessibilityRole="header"
          style={{
            color: theme.colors.foreground,
            fontSize: 15,
            lineHeight: 21,
            fontWeight: "600",
            flex: 1,
            minWidth: 0,
          }}
        >
          {task.title}
        </Text>
        {canOpenAgent && (
          <Button
            theme={theme}
            variant="quiet"
            dense={!compact}
            label="Open agent"
            icon="ArrowUpRight"
            accessibilityLabel={`Open ${task.id} agent`}
            onPress={() => {
              if (attempt) {
                openAgent?.(attempt.agentId);
              }
            }}
          />
        )}
      </View>
      {/* The worker row reads like the profile card's: the brand mark beside
          the model · thinking line, then the task's routing role chip when
          the task records one. No identity, no placeholder — the row then
          carries only the chip. */}
      {(worker || role) && (
        <View
          testID={`symphony-task-${task.id}-worker`}
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 6,
          }}
        >
          {worker && (
            <>
              <View style={{ flexShrink: 0 }}>
                <HarnessMark
                  provider={worker.provider}
                  {...(identity?.providerLabel
                    ? { label: identity.providerLabel }
                    : {})}
                  size={14}
                  color={theme.colors.foreground}
                  tone="brand"
                  surface={theme.colors.surface2}
                />
              </View>
              {/* The provider lives in the accessible label; sighted users
                  read it from the mark, and raw ids stand in while the
                  catalog has no entry for this provider or model. */}
              <Text
                numberOfLines={1}
                accessibilityLabel={
                  identity ? identityLabel(identity) : undefined
                }
                style={{
                  color: theme.colors.foreground,
                  fontSize: 12,
                  lineHeight: 17,
                  flexShrink: 1,
                }}
              >
                {worker.line}
              </Text>
            </>
          )}
          {role && (
            <RoleChip
              theme={theme}
              role={role}
              testID={`symphony-task-${task.id}-chip-${role}`}
            />
          )}
        </View>
      )}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 6,
        }}
      >
        <View
          aria-hidden
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Icon
            name={presentation.icon}
            size={14}
            color={statusColor(theme, presentation.color)}
          />
        </View>
        <Text
          selectable
          style={{
            color: statusColor(theme, presentation.color),
            fontSize: 12,
            lineHeight: 17,
            fontWeight: "500",
          }}
        >
          {presentation.label}
          {state.waitingFor.length
            ? ` · waiting for ${state.waitingFor.join(", ")}`
            : ""}
        </Text>
        <Text
          style={{
            color: theme.colors.foregroundMuted,
            fontSize: 12,
            lineHeight: 17,
            fontVariant: ["tabular-nums"],
          }}
        >
          {`· ${task.id}`}
        </Text>
        {carriedFrom !== undefined && (
          <Text
            testID={`symphony-task-${task.id}-carried`}
            style={{
              color: theme.colors.foregroundMuted,
              fontSize: 12,
              lineHeight: 17,
            }}
          >
            {`· result from loop ${carriedFrom}`}
          </Text>
        )}
        {agentAttempts > 1 && (
          <Text
            style={{
              color: theme.colors.foregroundMuted,
              fontSize: 12,
              lineHeight: 17,
            }}
          >
            {`· same agent across ${agentAttempts} attempts`}
          </Text>
        )}
      </View>
      {metrics.attemptCount > 0 && (
        <Text
          testID={`symphony-task-${task.id}-metrics`}
          selectable
          numberOfLines={1}
          style={{
            color: theme.colors.foregroundMuted,
            fontSize: 12,
            lineHeight: 17,
            fontVariant: ["tabular-nums"],
          }}
        >
          {[
            workTotalsLabel(metrics),
            `${formatDuration(metrics.elapsedMs)} elapsed`,
            tokenTotalsLabel(metrics.tokens),
          ].join(" · ")}
        </Text>
      )}
      {cardRouting && (
        <Text
          testID={`symphony-task-${task.id}-routing`}
          selectable
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{
            color: theme.colors.foregroundMuted,
            fontSize: 12,
            lineHeight: 17,
          }}
        >
          {routingLine(cardRouting, cardWorker)}
        </Text>
      )}
      {report === null && (
        <RoutingDisclosure
          theme={theme}
          taskId={task.id}
          routing={cardRouting}
          warnings={launch?.warnings}
          compact={compact}
        />
      )}
      {report?.summary && (
        <Summary
          theme={theme}
          summary={report.summary}
          compact={compact}
          expanded={disclosures?.summary === true}
          onToggle={() => onToggle?.("summary")}
        />
      )}
      {failedChecks.map((check) => (
        <Text
          key={check.name}
          selectable
          numberOfLines={2}
          ellipsizeMode="tail"
          style={{
            color: theme.colors.statusDanger,
            fontSize: 13,
            lineHeight: 20,
          }}
        >
          {`✕ ${check.name}: ${check.detail}`}
        </Text>
      ))}
      {attempt?.message && (
        <Notice theme={theme} warning>
          {attempt.message}
        </Notice>
      )}
      {attempt?.reopen && (
        <ReopenDisclosure theme={theme} attempt={attempt} compact={compact} />
      )}
      {report === null && (
        <InstructionPreview
          task={task}
          theme={theme}
          compact={compact}
          expanded={disclosures?.instructions === true}
          onToggle={() => onToggle?.("instructions")}
        />
      )}
      {report && (
        <ReportFooter
          theme={theme}
          taskId={task.id}
          report={report}
          compact={compact}
          evidenceOpen={disclosures?.evidence === true}
          checksOpen={disclosures?.checks === true}
          onToggle={(selection) => onToggle?.(selection)}
          {...(attempt?.launch
            ? {
                routing: { launch: attempt.launch } satisfies ReportRouting,
              }
            : {})}
        />
      )}
      {addedWrites.length > 0 && attempt && (
        <WritesDisclosure
          theme={theme}
          taskId={task.id}
          kind="added"
          grants={addedWrites}
          compact={compact}
        />
      )}
      {grantedWrites.length > 0 && attempt && (
        <WritesDisclosure
          theme={theme}
          taskId={task.id}
          kind="granted"
          grants={grantedWrites}
          compact={compact}
        />
      )}
    </View>
  );
}

/**
 * Compact accessible routing details for a card with no report yet: the
 * override category and evidence plus any stored warnings, behind a shared
 * Disclosure so a running takeover's card stays compact. Nothing renders
 * when the record carries neither an override nor warnings; with a report,
 * the same details live in the report's Routing disclosure instead.
 */
function RoutingDisclosure({
  theme,
  taskId,
  routing,
  warnings,
  compact,
}: {
  theme: PluginTheme;
  taskId: string;
  routing?:
    | Pick<AttemptRouting, "reason" | "selectedBy" | "override">
    | undefined;
  warnings?: readonly RoutingWarning[] | undefined;
  compact: boolean;
}) {
  const [open, setOpen] = useState(false);
  const override = routing ? overrideLine(routing) : null;
  const stored = warnings ?? [];
  if (!override && !stored.length) {
    return null;
  }
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        paddingTop: 8,
        gap: 8,
      }}
    >
      <Disclosure
        theme={theme}
        label={routingDisclosureLabel(stored.length)}
        expanded={open}
        onToggle={() => setOpen((value) => !value)}
        testID={`symphony-task-routing-${taskId}`}
        dense={!compact}
      />
      {open && (
        <InsetPanel theme={theme} nested>
          {override && (
            <Text
              selectable
              style={{
                color: theme.colors.foreground,
                fontSize: 13,
                lineHeight: 20,
                maxWidth: PROSE_WIDTH,
              }}
            >
              {override}
            </Text>
          )}
          {stored.map((warning, index) => (
            <Text
              key={`${warning.code}-${index}`}
              selectable
              style={{
                color: theme.colors.statusWarning,
                fontSize: 13,
                lineHeight: 20,
                maxWidth: PROSE_WIDTH,
              }}
            >
              {warningLine(warning)}
            </Text>
          ))}
        </InsetPanel>
      )}
    </View>
  );
}

/**
 * A reopened attempt's brief: why the Conductor reopened this task in a new
 * loop, then the findings the attempt addresses so the fix work and the
 * reviewer's defects stay linked on the card itself.
 */
function ReopenDisclosure({
  theme,
  attempt,
  compact,
}: {
  theme: PluginTheme;
  attempt: Attempt;
  compact: boolean;
}) {
  const reopen = attempt.reopen;
  const [expanded, setExpanded] = useState(false);
  if (!reopen) {
    return null;
  }
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        paddingTop: 8,
        gap: 8,
      }}
    >
      <Disclosure
        theme={theme}
        label={`Reopened · loop ${attemptLoop(attempt)}`}
        expanded={expanded}
        onToggle={() => setExpanded((open) => !open)}
        testID={`symphony-task-reopen-${attempt.taskId}`}
        dense={!compact}
      />
      <Text
        selectable
        numberOfLines={2}
        ellipsizeMode="tail"
        style={{
          color: theme.colors.foregroundMuted,
          fontSize: 12,
          lineHeight: 17,
          maxWidth: PROSE_WIDTH,
        }}
      >
        {reopen.reason}
      </Text>
      {expanded && reopen.findings.length > 0 && (
        <InsetPanel theme={theme} nested>
          <FindingsPanel theme={theme} findings={reopen.findings} />
        </InsetPanel>
      )}
    </View>
  );
}

/**
 * Write paths recorded beyond the task's declared scope, each with its reason:
 * "added" paths came from the Conductor and last for the task, "granted" paths
 * came from the latest attempt's widen and last for that attempt. Visible with
 * or without a report, because a running attempt can already hold grants.
 */
function WritesDisclosure({
  theme,
  taskId,
  kind,
  grants,
  compact,
}: {
  theme: PluginTheme;
  taskId: string;
  kind: "added" | "granted";
  grants: GrantedWrite[];
  compact: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = writesDisclosureLabel(kind, grants.length);
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        paddingTop: 8,
        gap: 8,
      }}
    >
      <Disclosure
        theme={theme}
        label={label}
        expanded={expanded}
        onToggle={() => setExpanded((open) => !open)}
        testID={`symphony-task-${kind}-${taskId}`}
        dense={!compact}
      />
      {expanded && (
        <InsetPanel theme={theme} nested>
          {grants.map((grant, index) => (
            <View
              key={`${grant.path}-${index}`}
              style={{
                paddingVertical: 6,
                borderTopWidth: index > 0 ? 1 : 0,
                borderTopColor: theme.colors.border,
                gap: 2,
              }}
            >
              <Text
                selectable
                style={{
                  color: theme.colors.foreground,
                  fontSize: 13,
                  lineHeight: 20,
                  fontWeight: "600",
                  maxWidth: PROSE_WIDTH,
                }}
              >
                {grant.path}
              </Text>
              <Text
                selectable
                style={{
                  color: theme.colors.foregroundMuted,
                  fontSize: 13,
                  lineHeight: 20,
                  maxWidth: PROSE_WIDTH,
                }}
              >
                {grant.reason}
              </Text>
            </View>
          ))}
        </InsetPanel>
      )}
    </View>
  );
}

/**
 * Report prose clamped to three visual lines by default. Whether the clamp
 * actually hides text depends on scene width, so the toggle never relies on a
 * character count alone: the length heuristic covers wide panes, and compact
 * layouts always offer the toggle so clamped prose is never unreachable. The
 * expanded state lives in SymphonyDetail's disclosure map so it survives
 * refreshes.
 */
function Summary({
  theme,
  summary,
  compact,
  expanded,
  onToggle,
}: {
  theme: PluginTheme;
  summary: string;
  compact: boolean;
  expanded: boolean;
  onToggle(this: void): void;
}) {
  return (
    <View style={{ gap: 4, maxWidth: PROSE_WIDTH }}>
      <Text
        selectable
        numberOfLines={expanded ? undefined : 3}
        ellipsizeMode="tail"
        style={{
          color: theme.colors.foreground,
          fontSize: 14,
          lineHeight: 21,
          maxWidth: PROSE_WIDTH,
        }}
      >
        {summary}
      </Text>
      {(summaryMayClamp(summary) || compact) && (
        <Button
          theme={theme}
          variant="quiet"
          dense={!compact}
          label={expanded ? "Show less" : "Show more"}
          onPress={onToggle}
        />
      )}
    </View>
  );
}

const INSTRUCTIONS_LABEL = "Instructions";

/**
 * Assignment preview when no report exists: at most three visible lines above
 * the footer, whose disclosure reveals the full selectable brief in the same
 * inset panel Evidence and Checks use.
 */
function InstructionPreview({
  task,
  theme,
  compact,
  expanded,
  onToggle,
}: {
  task: TaskDefinition;
  theme: PluginTheme;
  compact: boolean;
  expanded: boolean;
  onToggle(this: void): void;
}) {
  const lines = instructionLines(task);
  return (
    <View style={{ gap: 8 }}>
      {lines.length > 0 && (
        <Text
          numberOfLines={3}
          ellipsizeMode="tail"
          style={{
            color: theme.colors.foregroundMuted,
            fontSize: 13,
            lineHeight: 21,
            maxWidth: PROSE_WIDTH,
          }}
        >
          {lines.join("\n")}
        </Text>
      )}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          paddingTop: 8,
          gap: 8,
        }}
      >
        <Disclosure
          theme={theme}
          label={INSTRUCTIONS_LABEL}
          expanded={expanded}
          onToggle={onToggle}
          testID={`symphony-task-instructions-${task.id}`}
          dense={!compact}
        />
        {expanded && (
          <InsetPanel theme={theme} nested>
            {lines.map((line, index) => (
              <Text
                key={index}
                selectable
                style={{
                  color: theme.colors.foreground,
                  fontSize: 13,
                  lineHeight: 21,
                  maxWidth: PROSE_WIDTH,
                }}
              >
                {line}
              </Text>
            ))}
          </InsetPanel>
        )}
      </View>
    </View>
  );
}
