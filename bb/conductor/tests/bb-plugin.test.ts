import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { commandTools } from "conductor/commands/tools";
import plugin from "../server";

let home: string;
let previousHome: string | undefined;

beforeEach(async () => {
  home = await realpath(await mkdtemp(join(tmpdir(), "bb-conductor-")));
  previousHome = process.env.CONDUCTOR_HOME;
  process.env.CONDUCTOR_HOME = home;
});

afterEach(async () => {
  if (previousHome === undefined) {
    delete process.env.CONDUCTOR_HOME;
  } else {
    process.env.CONDUCTOR_HOME = previousHome;
  }
  await rm(home, { recursive: true, force: true });
});

async function loaded() {
  const host = createFakePluginHost({ pluginId: "conductor" });
  plugin(host.bb);
  return host;
}

function text(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }
  const { content } = result as { content: Array<{ text: string }> };
  return content.map((part) => part.text).join("");
}

void test("registers one conductor_ tool per command", async () => {
  const { harness } = await loaded();
  const tools = harness.registrations.agentTools;

  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    commandTools.map((tool) => `conductor_${tool.name}`).sort(),
  );
  assert.match(
    tools.find((tool) => tool.name === "conductor_orchestrate")?.instructions ??
      "",
    /\[Conductor agent commands\]/,
  );
  await harness.lifecycle.dispose();
});

void test("a tool call runs the command as the calling thread", async () => {
  const { harness } = await loaded();

  const result = await harness.behavior.callAgentTool(
    "conductor_list",
    {},
    { threadId: "thr_source" },
  );

  assert.deepEqual(JSON.parse(text(result)), {
    symphonies: [],
    unavailable: 0,
    incomplete: false,
  });
  await harness.lifecycle.dispose();
});

void test("an invalid command returns an error result, not a throw", async () => {
  const { harness } = await loaded();

  const result = await harness.behavior.callAgentTool(
    "conductor_get",
    { symphonyId: "not-a-uuid" },
    { threadId: "thr_source" },
  );

  assert.equal(typeof result === "object" && result.isError, true);
  assert.match(text(result), /Invalid command fields/);
  await harness.lifecycle.dispose();
});

void test("bb conductor list reports an empty store", async () => {
  const { harness } = await loaded();

  const result = await harness.behavior.runCli(["list"]);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "No symphonies.");
  await harness.lifecycle.dispose();
});
