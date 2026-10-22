import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { adoptLegacyDirectory, essentialsHome } from "../../home";

test("the data directory defaults to ~/.essentials and honors ESSENTIALS_HOME", () => {
  assert.equal(essentialsHome({}, "/home/ada"), "/home/ada/.essentials");
  assert.equal(essentialsHome({ ESSENTIALS_HOME: "/data/e" }, "/h"), "/data/e");
  assert.equal(
    essentialsHome({ ESSENTIALS_HOME: " " }, "/h"),
    "/h/.essentials",
  );
});

test("a legacy directory moves once", async () => {
  const root = await mkdtemp(join(tmpdir(), "nestkit-home-"));

  try {
    const legacy = join(root, "paseo", "storage", "provider-usage");
    const target = join(root, "home", ".essentials", "provider-usage");
    await mkdir(legacy, { recursive: true });
    await writeFile(join(legacy, "history.json"), "{}");
    assert.equal(adoptLegacyDirectory(target, legacy), target);
    assert.equal(await readFile(join(target, "history.json"), "utf8"), "{}");
    await assert.rejects(stat(legacy), { code: "ENOENT" });
    assert.equal(adoptLegacyDirectory(target, legacy), target);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an existing target wins and a missing legacy directory is ignored", async () => {
  const root = await mkdtemp(join(tmpdir(), "nestkit-home-"));

  try {
    const legacy = join(root, "legacy");
    const target = join(root, "target");
    assert.equal(adoptLegacyDirectory(target, legacy), target);
    await mkdir(legacy);
    await mkdir(target);
    await writeFile(join(legacy, "history.json"), "{}");
    assert.equal(adoptLegacyDirectory(target, legacy), target);
    assert.equal(await readFile(join(legacy, "history.json"), "utf8"), "{}");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
