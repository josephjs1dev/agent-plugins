import { z } from "zod";
import {
  profileOperationSchema,
  profilesStateSchema,
  revisionSchema,
  saveProfilesResultSchema,
} from "./profiles";
import { providerCatalogSchema } from "./profiles-contracts";

/** The Conductor worker profiles, their mode, revisions and diagnostics. */
export const listProfilesDefinition = {
  name: "profiles.list",
  input: z.object({}).strict(),
  output: profilesStateSchema,
};

/** Creates, replaces, deletes a profile, or sets the global routing mode. */
export const saveProfilesDefinition = {
  name: "profiles.save",
  input: z
    .object({
      expectedRevision: revisionSchema,
      operation: profileOperationSchema,
    })
    .strict(),
  output: saveProfilesResultSchema,
};

/** The available providers, models, thinking options and permission modes. */
export const listProfileProvidersDefinition = {
  name: "profiles.providers",
  input: z.object({}).strict(),
  output: providerCatalogSchema,
};
