import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, readlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { adoptLegacyHome, conductorHome } from "../server/core/home";
import { testDirectory } from "./fixtures";

void test("the data directory defaults to ~/.conductor and honors CONDUCTOR_HOME", () => {
  assert.equal(conductorHome({}, "/home/ada"), "/home/ada/.conductor");
  assert.equal(conductorHome({ CONDUCTOR_HOME: "/data/c" }, "/h"), "/data/c");
  assert.equal(conductorHome({ CONDUCTOR_HOME: " " }, "/h"), "/h/.conductor");
});

void test("a legacy directory moves once and leaves a link behind", async () => {
  const root = await testDirectory();
  const legacy = join(root, "paseo", "plugin-data", "conductor");
  const target = join(root, "home", ".conductor");
  await mkdir(legacy, { recursive: true });
  await writeFile(join(legacy, "profiles.json"), "{}");
  assert.equal(adoptLegacyHome(target, legacy), target);
  assert.equal(await readFile(join(target, "profiles.json"), "utf8"), "{}");
  assert.equal(await readlink(legacy), target);
  assert.equal(await readFile(join(legacy, "profiles.json"), "utf8"), "{}");
  assert.equal(adoptLegacyHome(target, legacy), target);
});

void test("an existing target wins and a missing legacy directory is ignored", async () => {
  const root = await testDirectory();
  const legacy = join(root, "legacy");
  const target = join(root, "target");
  assert.equal(adoptLegacyHome(target, legacy), target);
  await mkdir(legacy);
  await mkdir(target);
  await writeFile(join(legacy, "profiles.json"), "{}");
  assert.equal(adoptLegacyHome(target, legacy), target);
  assert.equal(await readFile(join(legacy, "profiles.json"), "utf8"), "{}");
});
