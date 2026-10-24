import assert from "node:assert/strict";
import { test } from "node:test";

import { providerIds, providerOfModel } from "../../providers";
import { readUsageDefinition } from "../../usage";
import { createUsageReader } from "../../usage-reader";

test("provider RPC validation rejects unknown providers before dispatch", () => {
  assert.equal(
    readUsageDefinition.input.safeParse({ provider: "unknown-provider" })
      .success,
    false,
  );

  for (const provider of providerIds) {
    assert.equal(
      readUsageDefinition.input.safeParse({ provider }).success,
      true,
    );
  }
});

test("model IDs resolve to the subscription their model provider bills", () => {
  assert.equal(providerOfModel("opencode-go/gpt-6-luna"), "opencode-go");
  assert.equal(providerOfModel("openai-codex/gpt-5.5"), "chatgpt");
  assert.equal(providerOfModel("anthropic/claude-opus-5-5"), "claude");
  assert.equal(providerOfModel("openai/gpt-5.5"), undefined);
  assert.equal(providerOfModel("gpt-5.5"), undefined);
  assert.equal(providerOfModel("/opencode-go"), undefined);
  assert.equal(providerOfModel("constructor/model"), undefined);
});

test("registered providers use separate caches and sanitize collector quota errors", async () => {
  const calls: string[] = [];
  const reader = createUsageReader(async (provider) => {
    calls.push(provider);
    throw new Error("private-credential");
  });

  try {
    for (const provider of providerIds) {
      const first = await reader.read(provider);
      const cached = await reader.read(provider);

      assert.equal(first.provider, provider);
      assert.equal(first.status, "unavailable");
      assert.equal(first.message.includes("private-credential"), false);
      assert.deepEqual(cached, first);
    }

    assert.deepEqual(calls, providerIds);
  } finally {
    reader.close();
  }
});
