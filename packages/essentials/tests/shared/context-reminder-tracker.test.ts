import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_SETTINGS } from "../../context-reminder/contracts";
import {
  createReminderTracker,
  demoNotice,
} from "../../context-reminder/tracker";

const MAX = 1_000_000;
const at = (percent: number) => (MAX * percent) / 100;

test("the tracker shows a rise at once and repeats after notifyEvery turns", () => {
  const tracker = createReminderTracker(() => 0);
  const settings = { ...DEFAULT_SETTINGS, notifyEvery: 2 };

  assert.equal(tracker.observe("a", at(10), MAX, settings), null);
  assert.equal(tracker.observe("a", at(30), MAX, settings)?.tier, "warn");
  assert.equal(tracker.observe("a", at(30), MAX, settings), null);
  assert.equal(tracker.observe("a", at(30), MAX, settings)?.tier, "warn");
  assert.deepEqual(tracker.observe("a", at(60), MAX, settings), {
    usedTokens: at(60),
    maxTokens: MAX,
    tier: "ask",
    snoozeMinutes: settings.snoozeMinutes,
  });
  // Agents keep separate state.
  assert.equal(tracker.observe("b", at(60), MAX, settings)?.tier, "ask");
});

test("the tracker stays quiet when disabled, empty, or snoozed", () => {
  let clock = 0;
  const tracker = createReminderTracker(() => clock);

  assert.equal(
    tracker.observe("a", at(60), MAX, { ...DEFAULT_SETTINGS, enabled: false }),
    null,
  );
  assert.equal(tracker.observe("a", 0, MAX, DEFAULT_SETTINGS), null);
  assert.equal(tracker.snooze("a", 30), new Date(30 * 60_000).toISOString());
  assert.equal(tracker.observe("a", at(60), MAX, DEFAULT_SETTINGS), null);
  clock = 31 * 60_000;
  assert.equal(
    tracker.observe("a", at(60), MAX, DEFAULT_SETTINGS)?.tier,
    "ask",
  );
  tracker.forget("a");
  assert.equal(
    tracker.observe("a", at(60), MAX, DEFAULT_SETTINGS)?.tier,
    "ask",
  );
});

test("a missing window size assumes the default window", () => {
  const tracker = createReminderTracker(() => 0);

  assert.equal(
    tracker.observe("a", at(30), null, DEFAULT_SETTINGS)?.maxTokens,
    MAX,
  );
  assert.equal(demoNotice(60, DEFAULT_SETTINGS).tier, "ask");
  assert.equal(demoNotice(0, DEFAULT_SETTINGS).tier, "warn");
});
