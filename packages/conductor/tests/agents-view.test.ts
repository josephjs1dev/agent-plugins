import assert from "node:assert/strict";
import test from "node:test";
import type { AgentItem, RequestForm } from "../agents/models";
import {
  archiveBlocked,
  canShowAll,
  cardMeta,
  cardParent,
  detailPlaceholder,
  nextAttentionItem,
  queueEmptyState,
  responseLocked,
  responseSubmission,
  scopedAgentCount,
  showSnoozedToggle,
  snoozeAction,
  toggleChoice,
  writeAnswer,
} from "../podium/agents-view";

const NOW = Date.parse("2026-01-01T12:00:00Z");

function item(patch: Partial<AgentItem> = {}): AgentItem {
  return {
    key: "a".repeat(64),
    agentId: "agent-a",
    requestId: null,
    agentTitle: "Agent A",
    provider: "codex",
    model: null,
    concertId: "concert-1",
    concertName: "Concert",
    projectName: "Project",
    parentAgentId: null,
    parentAgentTitle: null,
    childAgentCount: 0,
    archiveKey: "b".repeat(64),
    bucket: "idle",
    lastTurn: null,
    title: "Agent A",
    description: "",
    details: "",
    error: null,
    since: "2026-01-01T11:00:00Z",
    form: null,
    snoozedUntil: null,
    marked: false,
    delivery: null,
    ...patch,
  };
}

await test("agent counts and next items respect scope, delivery and notices", () => {
  const first = item({ key: "1".repeat(64), requestId: "r1" });
  const second = item({ key: "2".repeat(64), requestId: "r2" });
  const other = item({ agentId: "agent-b", concertId: "concert-2" });
  assert.equal(scopedAgentCount([first, second, other], undefined), 2);
  assert.equal(scopedAgentCount([first, second, other], "concert-1"), 1);
  assert.equal(nextAttentionItem([first, second], first.key, {}), second);
  assert.equal(
    nextAttentionItem([first, second], undefined, { [first.key]: "sending" }),
    second,
  );
  assert.equal(
    nextAttentionItem(
      [first, { ...second, delivery: "answered" }],
      first.key,
      {},
    ),
    undefined,
  );
});

await test("empty states name the host and distinguish their causes", () => {
  const base = {
    available: true,
    query: "",
    filter: "attention" as const,
    agentCount: 2,
    incomplete: true,
    hostName: "bb",
  };
  assert.equal(
    queueEmptyState({ ...base, available: false }).title,
    "Agent status unavailable",
  );
  assert.equal(
    queueEmptyState({ ...base, query: "x" }).title,
    "No matching agents or requests",
  );
  assert.match(
    queueEmptyState({ ...base, agentCount: 0 }).description,
    /agent in bb to get started/,
  );
  assert.match(queueEmptyState(base).description, /^2\+ current agents/);
  assert.equal(
    queueEmptyState({ ...base, filter: "running" }).title,
    "Nothing in this view",
  );
  assert.equal(canShowAll(2, "all", ""), false);
  assert.equal(canShowAll(2, "all", "x"), true);
  assert.equal(canShowAll(0, "running", ""), false);
  assert.equal(detailPlaceholder(true, "k").label, "Request no longer pending");
  assert.equal(
    detailPlaceholder(true, null).title,
    "Choose an item to review.",
  );
});

await test("show snoozed appears only on attention with a snoozed item", () => {
  const snoozed = item({ marked: true, snoozedUntil: NOW + 1000 });
  assert.equal(showSnoozedToggle("attention", false, [snoozed], NOW), true);
  assert.equal(showSnoozedToggle("attention", false, [item()], NOW), false);
  assert.equal(showSnoozedToggle("attention", true, [], NOW), true);
  assert.equal(showSnoozedToggle("all", true, [snoozed], NOW), false);
  assert.deepEqual(snoozeAction(snoozed, NOW), {
    label: "Unsnooze",
    minutes: 0,
  });
  assert.deepEqual(snoozeAction(item({ marked: true }), NOW), {
    label: "Snooze 15 min",
    minutes: 15,
  });
  assert.equal(snoozeAction(item(), NOW), null);
  assert.equal(
    cardMeta(item({ childAgentCount: 1, snoozedUntil: NOW + 1 }), NOW),
    "Concert · 1 child agent · Snoozed",
  );
  assert.equal(
    cardParent(item({ parentAgentId: "parent-123456789" }), 0),
    "Parent: unavailable parent (parent-1)",
  );
  assert.equal(cardParent(item({ parentAgentId: "p" }), 1), null);
});

await test("responses validate the draft and lock on stale or delivered", () => {
  const actions: RequestForm = {
    kind: "actions",
    actions: [{ id: "allow", label: "Allow", behavior: "allow" }],
  };
  assert.deepEqual(
    responseSubmission(actions, { kind: "action", actionId: "allow" }),
    { valid: true, label: "Confirm Allow" },
  );
  assert.deepEqual(responseSubmission(actions, undefined), {
    valid: false,
    label: "Send answer",
  });
  const waiting = item({ bucket: "waiting", requestId: "r" });
  const state = { stale: false, busy: false, delivery: null };
  assert.equal(responseLocked(waiting, state), false);
  assert.equal(
    responseLocked(waiting, { ...state, delivery: "sending" }),
    true,
  );
  assert.equal(responseLocked(item({ bucket: "failed" }), state), true);
});

await test("choices toggle per question mode", () => {
  const blank = { selected: [], text: "draft" };
  assert.deepEqual(toggleChoice(blank, 1, false), { selected: [1], text: "" });
  assert.deepEqual(toggleChoice({ selected: [1], text: "" }, 1, false), {
    selected: [],
    text: "",
  });
  assert.deepEqual(toggleChoice({ selected: [0], text: "t" }, 2, true), {
    selected: [0, 2],
    text: "t",
  });
  assert.deepEqual(writeAnswer({ selected: [0], text: "" }, "x", false), {
    selected: [],
    text: "x",
  });
});

await test("archive is blocked by children, staleness and uncertainty", () => {
  const state = {
    stale: false,
    directoryIncomplete: false,
    busy: false,
    uncertain: false,
  };
  assert.equal(archiveBlocked(item(), state), false);
  assert.equal(archiveBlocked(item({ childAgentCount: 1 }), state), true);
  assert.equal(archiveBlocked(item({ archiveKey: null }), state), true);
  assert.equal(archiveBlocked(item(), { ...state, uncertain: true }), true);
});
