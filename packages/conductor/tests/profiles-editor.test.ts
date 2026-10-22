import assert from "node:assert/strict";
import test from "node:test";
import {
  newProfileForm,
  routingFocusTarget,
  savedProfileForm,
  toggleRole,
  withModel,
  withProvider,
  type ProfileForm,
} from "../podium/profiles-draft";
import {
  profileEditorChoices,
  profileRolesNote,
} from "../podium/profiles-view";
import type { ProviderCatalog } from "../symphonies/profiles-contracts";

const catalog: ProviderCatalog = {
  providers: [
    {
      id: "claude",
      label: "Claude",
      available: true,
      status: "ready",
      defaultModeId: "default",
      models: [
        {
          id: "opus",
          label: "Opus",
          isDefault: true,
          thinkingOptions: [
            { id: "high", label: "High", isDefault: false },
            { id: "low", label: "Low", isDefault: true },
          ],
        },
      ],
      modes: [
        { id: "default", label: "Default", elevated: false },
        {
          id: "bypassPermissions",
          label: "Bypass",
          description: "Skips every prompt.",
          elevated: true,
        },
      ],
    },
    {
      id: "codex",
      label: "Codex",
      available: false,
      status: "unavailable",
      defaultModeId: null,
      models: [],
      modes: [],
    },
  ],
};

function form(changes: Partial<ProfileForm>): ProfileForm {
  return { ...newProfileForm(), ...changes };
}

void test("a provider choice clears the worker fields it owns", () => {
  const next = withProvider(
    form({
      provider: "claude",
      model: "opus",
      modeId: "x",
      thinkingOptionId: "y",
    }),
    "codex",
  );
  assert.deepEqual(
    [next.provider, next.model, next.modeId, next.thinkingOptionId],
    ["codex", "", "", ""],
  );
});

void test("a new model clears thinking; the same model keeps it", () => {
  const start = form({ model: "opus", thinkingOptionId: "high" });
  assert.equal(withModel(start, "opus").thinkingOptionId, "high");
  assert.equal(withModel(start, "sonnet").thinkingOptionId, "");
});

void test("toggleRole adds and removes a role", () => {
  const added = toggleRole(form({ roles: ["review"] }), "planning");
  assert.deepEqual(added.roles, ["review", "planning"]);
  assert.deepEqual(toggleRole(added, "review").roles, ["planning"]);
});

void test("a saved form carries the stored id and trimmed values", () => {
  const saved = savedProfileForm(
    form({ name: " Fast ", roles: ["review"], size: "small" }),
    {
      name: "Fast",
      notes: "",
      provider: "claude",
      model: undefined,
      thinkingOptionId: undefined,
      modeId: undefined,
      routing: null,
      instructions: "",
    },
    "11111111-1111-4111-8111-111111111111",
  );
  assert.equal(saved.id, "11111111-1111-4111-8111-111111111111");
  assert.equal(saved.name, "Fast");
  assert.equal(saved.model, "");
  assert.deepEqual(saved.roles, ["review"]);
});

void test("routing focus goes to a role, then to the size", () => {
  assert.deepEqual(routingFocusTarget(form({})), { kind: "role" });
  assert.deepEqual(routingFocusTarget(form({ roles: ["review"] })), {
    kind: "size",
    size: undefined,
  });
  assert.deepEqual(
    routingFocusTarget(form({ roles: ["review"], size: "large" })),
    { kind: "size", size: "large" },
  );
});

void test("editor choices follow the catalog entry for the form's worker", () => {
  const choices = profileEditorChoices(catalog, {
    provider: "claude",
    model: "opus",
    modeId: "bypassPermissions",
  });
  assert.ok(choices.entry);
  assert.deepEqual(
    choices.providers.map((choice) => choice.detail),
    [undefined, "unavailable"],
  );
  assert.deepEqual(choices.models, [
    { value: "opus", label: "Opus", detail: "default" },
  ]);
  assert.deepEqual(
    choices.thinking.map((choice) => choice.detail),
    [undefined, "default"],
  );
  assert.deepEqual(
    choices.modes.map((choice) => choice.detail),
    [undefined, "elevated"],
  );
  assert.equal(
    choices.modeHelper,
    "Skips every prompt. The Conductor's own permission ceiling always applies.",
  );
});

void test("an unknown provider has no entry and no worker choices", () => {
  const choices = profileEditorChoices(catalog, {
    provider: "pi",
    model: "",
    modeId: "",
  });
  assert.equal(choices.entry, undefined);
  assert.deepEqual(
    [choices.models, choices.modes, choices.thinking],
    [[], [], []],
  );
  assert.deepEqual(profileEditorChoices(undefined, form({})).providers, []);
});

void test("the roles note explains what routing does", () => {
  assert.equal(
    profileRolesNote({ roles: [], size: "" }, "strict"),
    "Routing never picks this profile. Enforce routing is on.",
  );
  assert.equal(
    profileRolesNote({ roles: ["review"], size: "" }, "warn"),
    "Routing considers this profile for one role once a size is set.",
  );
  assert.equal(
    profileRolesNote({ roles: ["review", "planning"], size: "small" }, "warn"),
    "Routing considers this profile for 2 roles and its size.",
  );
});
