import assert from "node:assert/strict";
import test from "node:test";
import type { TaskFinding } from "../symphonies/models";
import { checksLabel, findingsLabel, sortedFindings } from "../podium/report";
import {
  distinctExpectedOutcome,
  planAcceptedLine,
  reopenFindingLines,
  writeScopeGrownTasks,
} from "../podium/context";
import {
  routingDisclosureLabel,
  taskCardFacts,
  workerLine,
  writesDisclosureLabel,
} from "../podium/task-card";
import {
  fixtureAttempt,
  fixtureLaunch,
  planContext,
  storedSymphony,
  task,
} from "./symphony-fixtures";

function finding(id: string, severity: TaskFinding["severity"]): TaskFinding {
  return { id, severity, paths: [], summary: `${id} summary` };
}

void test("report labels count checks and blocking findings", () => {
  assert.equal(
    checksLabel([
      { name: "a", status: "passed", detail: "" },
      { name: "b", status: "failed", detail: "" },
      { name: "c", status: "not-run", detail: "" },
    ]),
    "Checks 1/3 passed · 1 failed",
  );
  assert.equal(checksLabel([]), "Checks 0/0 passed");
  const findings = [finding("m", "minor"), finding("b", "blocking")];
  assert.equal(findingsLabel(findings), "Findings 2 · 1 blocking");
  assert.deepEqual(
    sortedFindings(findings).map((entry) => entry.id),
    ["b", "m"],
  );
});

void test("task card facts carry an earlier loop and count agent attempts", () => {
  const symphony = storedSymphony();
  const definition = task("api");
  assert.equal(taskCardFacts(symphony, definition).attempt, undefined);
  symphony.execution.attempts = [
    fixtureAttempt("api", "failed", "a1", { launch: fixtureLaunch(true) }),
    fixtureAttempt("api", "completed", "a2", { launch: fixtureLaunch(true) }),
  ];
  const facts = taskCardFacts(symphony, definition, 2);
  assert.equal(facts.attempt?.id, "a2");
  assert.equal(facts.agentAttempts, 2);
  assert.equal(facts.carriedFrom, 1);
  assert.equal(facts.hasAgent, true);
  assert.equal(taskCardFacts(symphony, definition).carriedFrom, undefined);
});

void test("task card labels", () => {
  assert.equal(routingDisclosureLabel(0), "Routing");
  assert.equal(routingDisclosureLabel(1), "Routing · 1 warning");
  assert.equal(routingDisclosureLabel(2), "Routing · 2 warnings");
  assert.equal(writesDisclosureLabel("added", 2), "Added by Conductor 2");
  assert.equal(writesDisclosureLabel("granted", 1), "Granted writes 1");
  assert.equal(
    workerLine({
      provider: "claude",
      providerLabel: "Claude",
      modelLabel: "Opus",
      thinkingLabel: null,
      source: "planned",
    }),
    "Opus",
  );
});

void test("context derivations", () => {
  assert.equal(
    distinctExpectedOutcome(planContext),
    planContext.expectedOutcome,
  );
  assert.equal(
    distinctExpectedOutcome({ plan: " Goal ", expectedOutcome: "Goal" }),
    null,
  );
  const symphony = storedSymphony();
  assert.match(planAcceptedLine(symphony) ?? "", /· 3 tasks$/);
  assert.deepEqual(writeScopeGrownTasks(symphony), []);
  const first = symphony.revisions[0];
  assert.ok(first);
  symphony.revisions.push({
    ...first,
    number: 2,
    score: {
      tasks: first.score.tasks.map((entry) =>
        entry.id === "ui" ? { ...entry, writes: ["src/ui.ts"] } : entry,
      ),
    },
  });
  assert.deepEqual(writeScopeGrownTasks(symphony), ["ui"]);
  assert.deepEqual(
    reopenFindingLines({
      taskId: "ui",
      findings: ["F1 stored"],
      resolved: [finding("F1", "blocking")],
    }),
    ["F1: F1 summary"],
  );
});
