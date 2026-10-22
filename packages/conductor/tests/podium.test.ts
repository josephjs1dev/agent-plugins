import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteRefusal,
  summarizeSymphony,
  symphonyStatusLabel,
  type StoredSymphony,
  type SymphonyListEntry,
} from "../symphonies/models";
import {
  agentStatusPresentation,
  symphonyStatusPresentation,
} from "../podium/status";
import {
  formatDuration,
  taskCountLabel,
  tokenCountLabel,
  tokenTotalsLabel,
} from "../podium/labels";
import {
  progressFraction,
  progressLabel,
  segmentLabel,
} from "../podium/progress";
import { roleLabel, sizeLabel } from "../podium/roles";
import { ongoingGroups, ongoingIcon, ongoingLabel } from "../podium/ongoing";
import { symphonyGroups, visibleSymphonies } from "../podium/symphony-list";
import { PodiumSession } from "../podium/session";
import { archiveErrors, knownAgentIds } from "../podium/agents";
import { previewLines } from "../podium/report";
import {
  blockedSymphony,
  multiTaskSymphony,
  storedSymphony,
} from "./symphony-fixtures";

function entry(
  symphony: StoredSymphony,
  projectName = "api",
): SymphonyListEntry {
  return { ...summarizeSymphony(symphony), projectName };
}

void test("status presentations put the actionable state first", () => {
  assert.deepEqual(
    agentStatusPresentation({ bucket: "idle", requestId: "r1", marked: false }),
    { label: "Needs answer", icon: "MessageCircle", color: "statusWarning" },
  );
  assert.equal(
    agentStatusPresentation({ bucket: "idle", requestId: null, marked: true })
      .label,
    "Manual reminder",
  );
  assert.equal(
    agentStatusPresentation({
      bucket: "closed",
      requestId: null,
      marked: false,
    }).label,
    "Closed",
  );
  assert.equal(symphonyStatusPresentation("blocked").icon, "CirclePause");
});

void test("labels format durations, counts and token totals", () => {
  assert.equal(formatDuration(60_000), "1m");
  assert.equal(formatDuration(584 * 60_000), "9h 44m");
  assert.equal(formatDuration(120 * 60_000), "2h");
  assert.equal(taskCountLabel(1), "1 task");
  assert.equal(taskCountLabel(3), "3 tasks");
  assert.equal(tokenCountLabel(942), "942");
  assert.equal(tokenCountLabel(48_000), "48k");
  assert.equal(tokenCountLabel(1_250_000), "1.3m");
  assert.equal(
    tokenTotalsLabel({
      input: { total: 48_000, coverage: "complete" },
      cached: { total: 40_000, coverage: "partial" },
      output: { total: null, coverage: "unknown" },
    }),
    "48k in (≥ 40k cached)",
  );
  assert.equal(
    tokenTotalsLabel({
      input: { total: null, coverage: "unknown" },
      cached: { total: null, coverage: "unknown" },
      output: { total: null, coverage: "unknown" },
    }),
    "—",
  );
});

void test("progress clamps its fill and names each slice", () => {
  assert.equal(progressFraction(3, 2), 1);
  assert.equal(progressFraction(-1, 4), 0);
  assert.equal(progressFraction(1, 0), 0);
  assert.equal(progressLabel(2, 5), "2 of 5 tasks reported complete");
  assert.equal(
    segmentLabel({
      id: "t1",
      title: "Parser",
      state: "needs-changes",
      reportedComplete: false,
    }),
    "Parser: Needs changes",
  );
});

void test("role and size labels keep unknown ids", () => {
  assert.equal(roleLabel("review"), "Review");
  assert.equal(roleLabel("custom"), "custom");
  assert.equal(sizeLabel("large"), "Large");
  assert.equal(sizeLabel("huge"), "huge");
});

void test("ongoing groups follow known Conductor agents", () => {
  const ready = entry(storedSymphony());
  const blocked = entry(blockedSymphony());
  const groups = ongoingGroups([ready, blocked], new Set(["agent-1"]));
  assert.deepEqual([...groups.keys()], ["agent-1"]);
  const symphonies = groups.get("agent-1")?.symphonies ?? [];
  assert.equal(symphonies.length, 2);
  assert.equal(ongoingIcon(symphonies), "CirclePause");
  assert.equal(ongoingLabel(symphonies), symphonyStatusLabel("blocked"));
  assert.equal(ongoingLabel([ready]), `Symphony 0/${ready.taskCount}`);
  assert.equal(ongoingGroups([ready], new Set()).size, 0);
});

void test("symphony lists filter by status and query, grouped by project", () => {
  const ready = entry(storedSymphony(), "api");
  const blocked = entry(blockedSymphony(), "web");
  const multi = entry(multiTaskSymphony(), "api");
  const state = new PodiumSession().getSnapshot();
  assert.deepEqual(
    visibleSymphonies([ready, blocked], {
      ...state,
      symphonyFilter: "blocked",
    }),
    [blocked],
  );
  assert.deepEqual(
    visibleSymphonies([ready, blocked], { ...state, symphonyQuery: "WEB" }),
    [blocked],
  );
  assert.deepEqual(
    symphonyGroups([ready, blocked, multi]).map((group) => [
      group.label,
      group.entries.length,
    ]),
    [
      ["api", 2],
      ["web", 1],
    ],
  );
});

void test("only a settled, finished symphony can be deleted", () => {
  assert.equal(
    deleteRefusal(storedSymphony()),
    "Only finished symphonies can be deleted.",
  );
  assert.equal(
    deleteRefusal({ ...storedSymphony(), status: "completed" }),
    null,
  );
});

void test("agent helpers keep request agents and name the host", () => {
  assert.deepEqual(
    knownAgentIds({
      items: [
        { agentId: "a", requestId: "r1" },
        { agentId: "a", requestId: "r2" },
        { agentId: "b", requestId: null },
      ],
    }),
    ["a"],
  );
  assert.deepEqual(knownAgentIds(undefined), []);
  assert.match(archiveErrors("bb").has_children, /in bb before archiving/);
});

void test("previews keep the first three nonempty lines", () => {
  assert.deepEqual(previewLines("one\n\n two\nthree\nfour"), [
    "one",
    " two",
    "three",
  ]);
});
