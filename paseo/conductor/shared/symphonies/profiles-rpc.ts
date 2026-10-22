import { defineRpc } from "@getpaseo/plugin";
import {
  listProfileProvidersDefinition,
  listProfilesDefinition,
  saveProfilesDefinition,
} from "conductor/symphonies/profiles-rpc";
import { z } from "zod";
import { profileIdSchema, revisionSchema } from "conductor/symphonies/profiles";
import {
  importProfilesResultSchema,
  syncPreviewSchema,
  syncProfilesResultSchema,
} from "conductor/symphonies/profiles-contracts";

export * from "conductor/symphonies/profiles-contracts";

/** The Conductor worker profiles, their mode, revisions and diagnostics. */
export const listProfiles = defineRpc(listProfilesDefinition);

/** Creates, replaces, deletes a profile, or sets the global routing mode. */
export const saveProfiles = defineRpc(saveProfilesDefinition);

/** The available providers, models, thinking options and permission modes. */
export const listProfileProviders = defineRpc(listProfileProvidersDefinition);

/** Copies Paseo agent profiles once into unclassified Conductor profiles. */
export const importPaseoProfiles = defineRpc({
  name: "profiles.import",
  input: z.object({ expectedRevision: revisionSchema }).strict(),
  output: importProfilesResultSchema,
});

/** Plans exporting Conductor profiles to Paseo agent profiles without writing. */
export const syncPreview = defineRpc({
  // The SDK accepts only lowercase RPC method segments, so this is not
  // "profiles.syncPreview".
  name: "profiles.sync-preview",
  input: z.object({}).strict(),
  output: syncPreviewSchema,
});

/** Exports the selected Conductor profiles to Paseo agent profiles. */
export const syncProfiles = defineRpc({
  name: "profiles.sync",
  input: z
    .object({
      expectedRevision: revisionSchema,
      expectedPaseoRevision: revisionSchema,
      profileIds: z.array(profileIdSchema).min(1).max(32),
    })
    .strict(),
  output: syncProfilesResultSchema,
});
