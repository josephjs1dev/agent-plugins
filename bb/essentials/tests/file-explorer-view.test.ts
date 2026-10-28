import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  readShowHidden,
  readView,
  writeShowHidden,
  writeView,
  type ExplorerView,
} from "../client/file-explorer/view-state";

const saved: ExplorerView = {
  scope: "src",
  draft: "needle",
  selected: "src/deep/needle.ts",
  expanded: ["src", "src/deep"],
  pages: [JSON.stringify(["src", null])],
  scrollTop: 120,
};

const empty = readView("never-saved");

/** Installs a storage that holds `items`, or throws on every call. */
function storage(
  items: Map<string, string> | "refuse",
  name: "sessionStorage" | "localStorage" = "sessionStorage",
) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: {
      getItem: (key: string) => {
        if (items === "refuse") {
          throw new Error("storage refused");
        }
        return items.get(key) ?? null;
      },
      setItem: (key: string, value: string) => {
        if (items === "refuse") {
          throw new Error("storage refused");
        }
        items.set(key, value);
      },
    },
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "sessionStorage");
  Reflect.deleteProperty(globalThis, "localStorage");
});

void test("a saved view comes back for its thread only", () => {
  storage(new Map());
  writeView("t", saved);
  assert.deepEqual(readView("t"), saved);
  assert.deepEqual(readView("other"), empty);
});

void test("a malformed or unsafe saved view reads as empty", () => {
  const items = new Map<string, string>();
  storage(items);
  for (const raw of [
    "{",
    JSON.stringify({ ...saved, scope: "../outside" }),
    JSON.stringify({ ...saved, scrollTop: -1 }),
  ]) {
    items.set("essentials.file-explorer.v1:t", raw);
    assert.deepEqual(readView("t"), empty);
  }
});

void test("a view stays in memory when session storage refuses", () => {
  storage("refuse");
  writeView("t", saved);
  assert.deepEqual(readView("t"), saved);
});

void test("the hidden-files preference defaults to shown and persists", () => {
  const items = new Map<string, string>();
  storage(items, "localStorage");
  assert.equal(readShowHidden(), true);
  writeShowHidden(false);
  assert.equal(items.get("essentials.file-explorer.show-hidden"), "false");
  assert.equal(readShowHidden(), false);
  storage("refuse", "localStorage");
  writeShowHidden(true);
  assert.equal(readShowHidden(), true);
});
