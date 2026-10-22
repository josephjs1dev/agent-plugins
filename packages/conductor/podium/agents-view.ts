import type {
  AgentItem,
  AnswerResult,
  Decision,
  Receipt,
  RequestForm,
} from "../agents/models";
import {
  ageLabel,
  category,
  isSnoozed,
  needsAttention,
  type Filter,
} from "../agents/attention";
import { questionAnswers } from "../agents/questions";

/**
 * The Agents views' host-neutral state and copy, shared by every Podium.
 * Each function takes the host's name where the copy names the host.
 */

/** A response's local delivery notice, before the snapshot confirms it. */
export type DeliveryNotice = AnswerResult["status"] | "sending";

/** One question's answer inside a `questions` decision. */
export type Answer = Extract<Decision, { kind: "answers" }>["answers"][number];

/** The Agents view's fixed notices. */
export const AGENTS_COPY = {
  loading: "Loading agents and pending requests…",
  stale:
    "Could not refresh this host. Showing the last known state; answer controls are disabled.",
  incomplete:
    "Directory is incomplete. Counts are a lower bound; previously waiting agents are checked separately.",
  concertIncomplete:
    "Some concert names are unavailable. Agent requests remain visible.",
  turnHistoryIncomplete:
    "Some recorded turn outcomes could not be loaded. Missing outcomes remain unknown.",
  detailStale:
    "Connection or refresh unavailable. This is the last known state. Responses are disabled until a successful refresh.",
  actionError:
    "The action could not be confirmed. Refresh or open the agent before trying again.",
  responseScope:
    "Applies only to this request. Sending an answer does not confirm that work resumed.",
  turnCompletion: "Task completion: not verified by Conductor.",
  noReceipts: "No responses sent from Conductor yet.",
  archiveIncomplete:
    "Archiving is unavailable until the full agent directory can be checked.",
} as const;

/** The items inside the Podium's concert scope; every item when unscoped. */
export function scopedItems(
  items: readonly AgentItem[],
  concertId: string | undefined,
): AgentItem[] {
  return items.filter((item) => !concertId || item.concertId === concertId);
}

/** Distinct agents in scope; an agent and its requests count once. */
export function scopedAgentCount(
  items: readonly AgentItem[],
  concertId: string | undefined,
): number {
  return new Set(scopedItems(items, concertId).map((item) => item.agentId))
    .size;
}

/** "3 agents", with "+" for an incomplete directory and a stale marker. */
export function agentCoverage(
  count: number,
  incomplete: boolean,
  stale: boolean,
): string {
  return `${count}${incomplete ? "+" : ""} agents${stale ? " · last known" : ""}`;
}

/**
 * The next attention item for "Next item": not the current item, and not
 * one whose response is delivered, uncertain, or sent from this Podium.
 */
export function nextAttentionItem(
  attention: readonly AgentItem[],
  currentKey: string | undefined,
  notices: Readonly<Record<string, DeliveryNotice>>,
): AgentItem | undefined {
  return attention.find(
    (item) =>
      item.key !== currentKey && item.delivery === null && !notices[item.key],
  );
}

/** Whether the empty queue offers "View all agents". */
export function canShowAll(
  agentCount: number,
  filter: Filter,
  query: string,
): boolean {
  return agentCount > 0 && (filter !== "all" || Boolean(query));
}

/** The empty queue's title and description. */
export function queueEmptyState(input: {
  /** A snapshot loaded and the last refresh succeeded. */
  available: boolean;
  query: string;
  filter: Filter;
  agentCount: number;
  incomplete: boolean;
  hostName: string;
}): { title: string; description: string } {
  if (!input.available) {
    return {
      title: "Agent status unavailable",
      description: "Refresh to check the current state of your agents.",
    };
  }
  const fallback = "Try another status or clear your search.";
  if (input.query) {
    return { title: "No matching agents or requests", description: fallback };
  }
  if (input.agentCount === 0) {
    return {
      title: "No agents in this scope",
      description: `Existing agents appear automatically. Open or create an agent in ${input.hostName} to get started.`,
    };
  }
  if (input.filter === "attention") {
    return {
      title: "No agents need attention",
      description: `${input.agentCount}${input.incomplete ? "+" : ""} current agents checked. No pending questions, approvals, failures, or reminders in this view.`,
    };
  }
  return { title: "Nothing in this view", description: fallback };
}

/** The detail pane's copy while no current item is selected. */
export function detailPlaceholder(
  hasAttention: boolean,
  selectedKey: string | null,
): { label: string; title: string; description: string } {
  if (selectedKey) {
    return {
      label: "Request no longer pending",
      title: "This item changed or was resolved.",
      description:
        "Your draft stays with the original request. Continue to the next item needing attention.",
    };
  }
  if (hasAttention) {
    return {
      label: "Your next action",
      title: "Choose an item to review.",
      description:
        "Select a question, approval, failure, or reminder from the queue.",
    };
  }
  return {
    label: "Your next action",
    title: "Choose an agent to follow.",
    description:
      "Existing and new agents are checked automatically. Use Running, Inactive, or All to follow their current state.",
  };
}

/** "Show snoozed" appears on Needs attention while it is on or applies. */
export function showSnoozedToggle(
  filter: Filter,
  showSnoozed: boolean,
  scoped: readonly AgentItem[],
  now: number,
): boolean {
  return (
    filter === "attention" &&
    (showSnoozed ||
      scoped.some((item) => category(item) === filter && isSnoozed(item, now)))
  );
}

/** "Auto-refresh on · 09:12", or "Last updated" for a stale snapshot. */
export function refreshStamp(stale: boolean, fetchedAt: number): string {
  const time = new Date(fetchedAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${stale ? "Last updated" : "Auto-refresh on"} · ${time}`;
}

/** One recent-delivery line, naming the agent by its title when known. */
export function receiptLine(
  receipt: Receipt,
  items: readonly AgentItem[],
): string {
  const agent =
    items.find((item) => item.agentId === receipt.agentId)?.agentTitle ??
    receipt.agentId.slice(0, 12);
  const status = receipt.status === "answered" ? "Delivered" : "Unconfirmed";
  return `${status} · ${agent} · ${new Date(receipt.at).toLocaleTimeString()}`;
}

/** A queue card's or detail's title: the request, else the agent. */
export function itemTitle(item: AgentItem): string {
  return item.requestId ? item.title : item.agentTitle;
}

/** A queue card's accessible name. */
export function cardLabel(item: AgentItem): string {
  return item.requestId
    ? `Open ${item.title} from ${item.agentTitle}`
    : `Open ${item.agentTitle}`;
}

/** A queue card's quiet metadata: concert, children, snooze. */
export function cardMeta(item: AgentItem, now: number): string {
  const count = item.childAgentCount;
  return [
    item.concertName,
    count > 0 && `${count} child ${count === 1 ? "agent" : "agents"}`,
    isSnoozed(item, now) && "Snoozed",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * A root card's parent line; a nested card sits under its parent instead.
 */
export function cardParent(item: AgentItem, depth: number): string | null {
  if (!item.parentAgentId || depth !== 0) {
    return null;
  }
  return `Parent: ${item.parentAgentTitle ?? `unavailable parent (${item.parentAgentId.slice(0, 8)})`}`;
}

/** The detail's parent title, with the full id while it is unavailable. */
export function parentTitle(item: AgentItem): string | null {
  if (!item.parentAgentId) {
    return null;
  }
  return item.parentAgentTitle ?? `Unavailable parent (${item.parentAgentId})`;
}

/** A queue card's delivery warning for a response sent from Conductor. */
export function cardDelivery(item: AgentItem): string | null {
  if (!item.delivery) {
    return null;
  }
  return item.delivery === "answered"
    ? "Response delivered"
    : "Check response delivery";
}

/** The worker line's accessible name: provider and model. */
export function workerLabel(worker: {
  providerLabel: string;
  modelLabel: string | null;
}): string {
  return [worker.providerLabel, worker.modelLabel].filter(Boolean).join(" · ");
}

/** The detail metadata's accessible name. */
export function detailMetaLabel(
  item: AgentItem,
  worker: { providerLabel: string; modelLabel: string | null },
  now: number,
): string {
  return [
    item.requestId ? item.agentTitle : null,
    worker.providerLabel,
    worker.modelLabel,
    item.bucket,
    ageLabel(item.since, now),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The response delivery the detail shows: a local notice wins. */
export function itemDelivery(
  item: AgentItem,
  notice: DeliveryNotice | undefined,
): DeliveryNotice | AgentItem["delivery"] {
  return notice ?? item.delivery;
}

/** Whether the response form is read-only. */
export function responseLocked(
  item: AgentItem,
  state: {
    stale: boolean;
    busy: boolean;
    delivery: DeliveryNotice | AgentItem["delivery"] | undefined;
  },
): boolean {
  return (
    state.stale ||
    state.busy ||
    (state.delivery !== null && state.delivery !== undefined) ||
    item.bucket === "failed" ||
    item.bucket === "closed"
  );
}

/** Whether the draft completes the form, and the submit button's label. */
export function responseSubmission(
  form: RequestForm | null,
  draft: Decision | undefined,
): { valid: boolean; label: string } {
  if (draft && form?.kind === "questions") {
    return {
      valid: questionAnswers(form, draft) !== null,
      label: "Send answer",
    };
  }
  if (draft?.kind === "action" && form?.kind === "actions") {
    const action = form.actions.find((entry) => entry.id === draft.actionId);
    return {
      valid: Boolean(action),
      label: `Confirm ${action?.label ?? "response"}`,
    };
  }
  return { valid: false, label: "Send answer" };
}

/** The snooze control for an item, or null when snoozing does not apply. */
export function snoozeAction(
  item: AgentItem,
  now: number,
): { label: string; minutes: 0 | 15 } | null {
  if (isSnoozed(item, now)) {
    return { label: "Unsnooze", minutes: 0 };
  }
  return needsAttention(item) ? { label: "Snooze 15 min", minutes: 15 } : null;
}

/** Where snooze applies, naming the host that owns native notifications. */
export function snoozeNote(hostName: string): string {
  return `Snooze affects Conductor’s queue only. ${hostName} controls native notifications.`;
}

/** An agent item's turn outcome, which never claims task completion. */
export function turnOutcome(item: AgentItem): {
  summary: string;
  explanation: string;
} {
  if (item.lastTurn) {
    return {
      summary: `Last turn ${item.lastTurn.outcome} · observed ${new Date(item.lastTurn.observedAt).toLocaleString()}`,
      explanation:
        "This is a recorded response outcome, not a verified task result. Review the output and required checks before treating the work as complete.",
    };
  }
  return {
    summary: "Outcome unknown — no recorded end for the current turn.",
    explanation:
      "Idle means not running. Closed means the session is closed. Neither proves the task is complete. Earlier outcomes cannot be recovered from an unread flag.",
  };
}

/** The blank answers a question form starts from. */
export function blankAnswers(
  form: Extract<RequestForm, { kind: "questions" }>,
): Answer[] {
  return form.questions.map(() => ({ selected: [], text: "" }));
}

/**
 * Toggles one option. A single-select question keeps only that option and
 * drops free text; a multi-select question keeps both.
 */
export function toggleChoice(
  answer: Answer,
  choice: number,
  multiSelect: boolean,
): Answer {
  const selected = answer.selected.includes(choice);
  if (!multiSelect) {
    return { selected: selected ? [] : [choice], text: "" };
  }
  return {
    selected: selected
      ? answer.selected.filter((item) => item !== choice)
      : [...answer.selected, choice],
    text: answer.text,
  };
}

/**
 * Writes free text. A single-select question drops its option; a
 * multi-select question keeps its options.
 */
export function writeAnswer(
  answer: Answer,
  text: string,
  multiSelect: boolean,
): Answer {
  return { text, selected: multiSelect ? answer.selected : [] };
}

/** Whether an item offers archiving: only inactive agents do. */
export function canArchive(item: AgentItem): boolean {
  return category(item) === "inactive";
}

/** Whether the archive controls are disabled. */
export function archiveBlocked(
  item: AgentItem,
  state: {
    stale: boolean;
    directoryIncomplete: boolean;
    busy: boolean;
    uncertain: boolean;
  },
): boolean {
  return (
    state.stale ||
    state.directoryIncomplete ||
    !item.archiveKey ||
    item.childAgentCount > 0 ||
    state.busy ||
    state.uncertain
  );
}

/** The archive confirmation and child hint, naming the host. */
export function archivePrompts(hostName: string) {
  return {
    confirm: (agentTitle: string) =>
      `Archive ${agentTitle}? This removes the agent from active ${hostName} lists. Concert files remain.`,
    children: `Archive children first. ${hostName} can archive attached children when their parent is archived.`,
  };
}
