import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cleanerCandidates,
  type ThreadCleaner,
} from "../../cleaner/eligibility";

function old(id: string, changes: Partial<ThreadCleaner> = {}): ThreadCleaner {
  return {
    id,
    title: id,
    titleFallback: null,
    projectId: "p",
    updatedAt: 1,
    pinnedAt: null,
    deletedAt: null,
    parentThreadId: null,
    lifecycleOwnerThreadId: null,
    visibility: "visible",
    status: "idle",
    runtime: { displayStatus: "idle" },
    hasPendingInteraction: false,
    queuedWork: "none",
    activity: { activeWorkflowCount: 0 },
    ...changes,
  };
}

const ids = (rows: ThreadCleaner[]) =>
  cleanerCandidates(rows, 100).map((entry) => entry.id);

test("a parent stays when any hidden dependent is ineligible", () => {
  for (const changes of [
    { pinnedAt: 2 },
    { updatedAt: 100 },
    { status: "active" },
    { runtime: { displayStatus: "stopping" } },
    { hasPendingInteraction: true },
    { queuedWork: "waiting" },
    { activity: { activeGoalCount: 1 } },
  ]) {
    const rows = [
      old("parent"),
      old("child", {
        visibility: "hidden",
        lifecycleOwnerThreadId: "parent",
        ...changes,
      }),
    ];
    assert.deepEqual(cleanerCandidates(rows, 100), [], JSON.stringify(changes));
  }
});

test("hidden descendants appear once and overlapping trees are disjoint", () => {
  const rows = [
    old("parent"),
    old("child", { parentThreadId: "parent" }),
    old("hidden", { visibility: "hidden", lifecycleOwnerThreadId: "child" }),
    old("other"),
  ];
  assert.deepEqual(
    cleanerCandidates(rows, 100).map((entry) => [
      entry.id,
      entry.members.map((member) => member.id),
    ]),
    [
      ["parent", ["parent", "child", "hidden"]],
      ["other", ["other"]],
    ],
  );
});

test("a pinned thread protects its whole subtree through either link", () => {
  for (const link of ["parentThreadId", "lifecycleOwnerThreadId"] as const) {
    const rows = [
      old("pinned", { pinnedAt: 0, visibility: "hidden" }),
      old("child", { [link]: "pinned" }),
      old("hidden", { parentThreadId: "child", visibility: "hidden" }),
      old("grandchild", { lifecycleOwnerThreadId: "hidden" }),
      old("other"),
    ];
    assert.deepEqual(ids(rows), ["other"], link);
  }
});

test("a pinned descendant in an overlapping tree protects that tree", () => {
  const rows = [
    old("pinned", { pinnedAt: 2 }),
    old("overlap"),
    old("child", {
      parentThreadId: "pinned",
      lifecycleOwnerThreadId: "overlap",
    }),
    old("other"),
  ];
  assert.deepEqual(ids(rows), ["other"]);
});

test("pin protection stops on cycles", () => {
  const rows = [
    old("pinned", { pinnedAt: 2, parentThreadId: "child" }),
    old("child", { parentThreadId: "pinned" }),
    old("other"),
  ];
  assert.deepEqual(ids(rows), ["other"]);
});

test("unpinning an ancestor offers its subtree again", () => {
  const rows = [
    old("parent", { pinnedAt: 2 }),
    old("child", { parentThreadId: "parent" }),
  ];
  assert.deepEqual(cleanerCandidates(rows, 100), []);
  rows[0] = old("parent");
  assert.deepEqual(
    cleanerCandidates(rows, 100).map((entry) =>
      entry.members.map((member) => member.id),
    ),
    [["parent", "child"]],
  );
});

test("a thread without a title uses its fallback, then a placeholder", () => {
  const rows = [
    old("a", { title: null, titleFallback: "Fallback" }),
    old("b", { title: null }),
  ];
  assert.deepEqual(
    cleanerCandidates(rows, 100).map((entry) => entry.title),
    ["Fallback", "Untitled thread"],
  );
});
