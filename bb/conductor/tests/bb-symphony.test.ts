import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, test } from "node:test";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import plugin from "../server";

const run = promisify(execFile);
let root: string;
let previousHome: string | undefined;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "bb-symphony-")));
  previousHome = process.env.CONDUCTOR_HOME;
  process.env.CONDUCTOR_HOME = join(root, "home");
});

afterEach(async () => {
  if (previousHome === undefined) {
    delete process.env.CONDUCTOR_HOME;
  } else {
    process.env.CONDUCTOR_HOME = previousHome;
  }
  await rm(root, { recursive: true, force: true });
});

async function checkout(): Promise<string> {
  const repo = join(root, "repo");
  await mkdir(repo);
  await writeFile(join(repo, "README.md"), "# Repo\n");
  const git = (...args: string[]) => run("git", args, { cwd: repo });
  await git("init", "-q");
  await git("add", ".");
  await git(
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "-qm",
    "init",
  );
  return repo;
}

function body(result: unknown): Record<string, unknown> {
  const text =
    typeof result === "string"
      ? result
      : (result as { content: Array<{ text: string }> }).content
          .map((part) => part.text)
          .join("");
  assert.ok(typeof result === "string", `tool returned an error: ${text}`);
  return JSON.parse(text) as Record<string, unknown>;
}

void test("a source thread orchestrates, dispatches a task thread, and finishes", async () => {
  const repo = await checkout();
  const source = makeThreadResponse({
    id: "thr_source",
    projectId: "proj_1",
    environmentId: "env_1",
    providerId: "codex",
    status: "active",
  });
  const threads = new Map([[source.id, source]]);
  const { bb, harness } = createFakePluginHost({
    pluginId: "conductor",
    sdk: {
      system: { config: async () => ({ primaryHostId: "host_local" }) },
      threads: {
        get: async ({ threadId }: { threadId: string }) => {
          const value = threads.get(threadId);
          if (!value) {
            throw Object.assign(new Error("Thread not found"), { status: 404 });
          }
          return value;
        },
        defaultExecutionOptions: async () => ({
          model: "gpt",
          permissionMode: "auto",
          reasoningLevel: "medium",
          serviceTier: "default",
          source: "client/thread/start",
        }),
        list: async () => [],
        experimental_listPluginMetadata: async () => ({ threads: [] }),
        spawn: async (args: { title?: string | undefined }) => {
          const child = makeThreadResponse({
            id: `thr_task_${threads.size}`,
            projectId: "proj_1",
            parentThreadId: source.id,
            environmentId: "env_1",
            providerId: "codex",
            status: "active",
            title: args.title ?? null,
          });
          threads.set(child.id, child);
          return child;
        },
        send: async () => ({}),
      },
      environments: {
        get: async ({ environmentId }: { environmentId: string }) => ({
          id: environmentId,
          hostId: "host_local",
          name: "main",
          branchName: "main",
          path: repo,
        }),
      },
      providers: {
        list: async () => [{ id: "codex", available: true }],
        models: async () => ({
          models: [{ id: "codex:gpt", model: "gpt" }],
          modelLoadError: null,
        }),
      },
    },
  });
  plugin(bb);
  const call = (threadId: string, command: string, input: object) =>
    harness.behavior.callAgentTool(`conductor_${command}`, input, { threadId });

  const orchestrated = body(
    await call(source.id, "orchestrate", {
      key: "explore-readme",
      title: "Explore the README",
      goal: "Read the README and summarize it.",
    }),
  );
  const symphonyId = orchestrated.symphonyId as string;
  assert.match(symphonyId, /^[0-9a-f-]{36}$/);

  body(
    await call(source.id, "define", {
      symphonyId,
      tasks: [
        {
          id: "read",
          title: "Read the README",
          description: "Read README.md and summarize it.",
          dependsOn: [],
          reads: ["README.md"],
          writes: [],
          checks: [],
          profile: "inherit",
          routing: { reason: "The task needs the Conductor's own model." },
        },
      ],
    }),
  );
  body(await call(source.id, "dispatch", { symphonyId }));

  const spawns = harness.inspection.sdk.callsTo("threads.spawn");
  assert.equal(spawns.length, 1);
  const [taskThread] = [...threads.keys()].filter((id) => id !== source.id);
  assert.ok(taskThread);

  const assigned = body(await call(taskThread, "get", { symphonyId }));
  const symphony = assigned.symphony as {
    execution: { attempts: Array<{ id: string; taskId: string }> };
  };
  const attempt = symphony.execution.attempts.find(
    (entry) => entry.taskId === "read",
  );
  assert.ok(attempt);

  body(
    await call(taskThread, "report", {
      symphonyId,
      attemptId: attempt.id,
      report: {
        outcome: "completed",
        summary: "The README has one heading.",
        evidence: ["Read README.md"],
        checks: [],
      },
    }),
  );
  // The task thread settles before the Conductor may finish.
  threads.set(taskThread, { ...threads.get(taskThread)!, status: "idle" });
  const reconcile = harness.behavior.runService("reconcile");
  // One pass observes the settled task thread and releases its claim.
  await new Promise((resolve) => setTimeout(resolve, 300));
  reconcile.controller.abort();
  await reconcile.done;

  const finished = body(
    await call(source.id, "finish", {
      symphonyId,
      summary: "Read the README. No checks were required.",
    }),
  );
  assert.equal((finished.symphony as { status: string }).status, "completed");
  await harness.lifecycle.dispose();
});
