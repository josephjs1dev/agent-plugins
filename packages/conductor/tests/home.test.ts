import assert from "node:assert/strict";
import test from "node:test";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { adoptHostDirectory, adoptLegacyHome, conductorHome } from "../home";
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

void test("a host's entries move out of the shared home once and leave launcher links", async () => {
  const home = await testDirectory();
  const target = join(home, "paseo");
  await mkdir(join(home, "symphonies"));
  await writeFile(join(home, "symphonies", "s.json"), "{}");
  await mkdir(join(home, "agent-commands"));
  await writeFile(join(home, "command.mjs"), "launcher");
  await writeFile(join(home, "profiles.json"), "[]");
  await mkdir(join(home, "bb"));
  assert.equal(adoptHostDirectory(home, target), target);
  assert.equal(
    await readFile(join(target, "symphonies", "s.json"), "utf8"),
    "{}",
  );
  await assert.rejects(lstat(join(home, "symphonies")));
  assert.equal(await readFile(join(home, "profiles.json"), "utf8"), "[]");
  assert.ok((await lstat(join(home, "bb"))).isDirectory());
  for (const name of ["command.mjs", "agent-commands", "commands.sock"]) {
    assert.equal(await readlink(join(home, name)), join(target, name));
  }
  assert.equal(await readFile(join(home, "command.mjs"), "utf8"), "launcher");
  assert.equal(adoptHostDirectory(home, target), target);
});

void test("an existing host directory or an empty home moves nothing", async () => {
  const home = await testDirectory();
  const target = join(home, "paseo");
  assert.equal(adoptHostDirectory(home, target), target);
  await assert.rejects(lstat(target));
  await mkdir(target);
  await mkdir(join(home, "symphonies"));
  assert.equal(adoptHostDirectory(home, target), target);
  assert.ok((await lstat(join(home, "symphonies"))).isDirectory());
});

void test(
  "a failed move keeps the home in use",
  { skip: process.getuid?.() === 0 && "root ignores directory permissions" },
  async () => {
    const home = await testDirectory();
    const parent = join(home, "locked");
    await mkdir(parent);
    await chmod(parent, 0o500);
    await mkdir(join(home, "symphonies"));
    try {
      assert.equal(adoptHostDirectory(home, join(parent, "paseo")), home);
      assert.ok((await lstat(join(home, "symphonies"))).isDirectory());
    } finally {
      await chmod(parent, 0o700);
    }
  },
);
