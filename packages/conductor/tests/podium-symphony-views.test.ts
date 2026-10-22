import assert from "node:assert/strict";
import test from "node:test";
import { summarizeSymphony } from "../symphonies/models";
import { layoutGraph } from "../symphonies/layout";
import { symphonyMetrics } from "../symphonies/metrics";
import {
  graphNodeLabel,
  graphRelations,
  selectionRelationsText,
} from "../podium/graph";
import {
  detailProgress,
  loopNote,
  metricsLine,
  resultLabel,
} from "../podium/symphony-detail";
import { symphonyCaption, symphonyCountLabel } from "../podium/symphony-list";
import { score, storedSymphony, task } from "./symphony-fixtures";

void test("graph relations cover direct edges, conflicts and dependents", () => {
  const tasks = [
    ...score().tasks,
    task("docs", { resources: ["lock"] }),
    task("lint", { resources: ["lock"] }),
  ];
  const layout = layoutGraph({ tasks });
  const api = tasks.find((entry) => entry.id === "api");
  const docs = tasks.find((entry) => entry.id === "docs");
  assert.ok(api && docs);
  const apiRelations = graphRelations(tasks, layout.edges, api);
  assert.deepEqual([...apiRelations.connected], ["collect"]);
  assert.deepEqual(apiRelations.dependents, ["collect"]);
  assert.deepEqual(apiRelations.conflicts, []);
  const docsRelations = graphRelations(tasks, layout.edges, docs);
  assert.ok(docsRelations.connected.has("lint"));
  assert.equal(docsRelations.conflicts[0]?.other.id, "lint");
  assert.equal(
    selectionRelationsText(api, apiRelations.dependents, []),
    "No dependencies\nNeeded by collect",
  );
});

void test("graph node labels promise selection, not navigation", () => {
  const collect = score().tasks[2];
  assert.ok(collect);
  assert.equal(
    graphNodeLabel({
      task: collect,
      stateLabel: "Waiting",
      identity: null,
      selected: false,
    }),
    "Select task collect — Investigate collect. Waiting. Waits for api, ui.",
  );
});

void test("detail header helpers describe the stored symphony", () => {
  const symphony = storedSymphony();
  const progress = detailProgress(symphony);
  assert.equal(
    progress.taskCount,
    symphony.revisions.at(-1)?.score.tasks.length,
  );
  assert.equal(progress.completed, 0);
  assert.match(resultLabel(symphony), /^RESULT · REPORTED BY THE /);
  assert.equal(typeof loopNote(symphony), "string");
  const line = metricsLine(symphonyMetrics(symphony, Date.now()));
  assert.match(line, /elapsed · .* (work|wall)/);
});

void test("list captions and counts", () => {
  const entry = { ...summarizeSymphony(storedSymphony()), projectName: "api" };
  assert.match(symphonyCaption(entry), /tasks reported complete$|Splitting/);
  assert.equal(symphonyCountLabel(1), "1 symphony");
  assert.equal(symphonyCountLabel(2), "2 symphonies");
});
