import { isClassifiedRouting, type RoutingMode } from "../symphonies/routing";
import type { ConductorProfile } from "../symphonies/profiles";
import type {
  ProviderCatalog,
  ProviderEntry,
} from "../symphonies/profiles-contracts";
import type { ProfileForm } from "./profiles-draft";

/**
 * What the routing toggle promises per state. Off (warn) trusts the Conductor
 * and records deviations; on (strict) requires it to justify each one.
 */
export const MODE_DESCRIPTION: Record<RoutingMode, string> = {
  warn: "Picks outside routing are allowed and noted on the task.",
  strict:
    "Picks outside routing need a justification with evidence, or they are rejected.",
};

/** The collapsed comparison behind "Learn what's checked", per mode. */
export const CHECKED_LINES: Record<RoutingMode, string[]> = {
  warn: [
    "The smallest eligible profile is always accepted.",
    "A larger profile, an unclassified profile, or the Conductor's own model " +
      "is accepted and noted on the task.",
    "A task with no eligible profile and no explicit choice is always " +
      "rejected.",
  ],
  strict: [
    "The smallest eligible profile is always accepted.",
    "A larger profile, an unclassified profile, or the Conductor's own model " +
      "needs an override with evidence.",
    "A task with no eligible profile and no explicit choice is always " +
      "rejected.",
  ],
};

/** The checked line that applies to both modes, last in the disclosure. */
export const RECHECK_LINE =
  "Turning this on also rechecks the next retry of tasks already running.";

/**
 * The provider catalog marks the worker line incomplete: an unknown provider
 * id, a provider that is not ready, or a model the provider does not list.
 * Nothing is marked while the catalog has not loaded, so the checklist stays
 * quiet instead of warning about data that is merely missing client-side.
 */
export function profileIncomplete(
  profile: ConductorProfile,
  catalog: ProviderCatalog | undefined,
): boolean {
  if (!catalog) {
    return false;
  }
  const entry = catalog.providers.find(
    (provider) => provider.id === profile.provider,
  );
  if (!entry || !entry.available || entry.models.length === 0) {
    return true;
  }
  if (
    profile.model &&
    !entry.models.some((model) => model.id === profile.model)
  ) {
    return true;
  }
  return false;
}

/**
 * Why routing cannot pick this profile, for the card's own warning row:
 * classification needs at least one role and a size, and it needs a worker
 * the provider catalog reports as available. `undefined` means there is
 * nothing to warn about.
 */
export function profileCardWarning(
  profile: ConductorProfile,
  catalog: ProviderCatalog | undefined,
): string | undefined {
  if (isClassifiedRouting(profile.routing)) {
    return profileIncomplete(profile, catalog)
      ? "The worker is not available, so routing skips this profile."
      : undefined;
  }
  const roles = profile.routing?.roles ?? [];
  if (roles.length > 0) {
    return "Needs a size before routing can pick it.";
  }
  if (profile.routing?.size !== undefined) {
    return "Needs at least one role before routing can pick it.";
  }
  return "Needs roles and size before routing can pick it.";
}

/** One picker choice: `label` names it, `detail` is quieter trailing text. */
export interface ProfileChoice {
  value: string;
  label: string;
  detail?: string | undefined;
}

/** The editor's catalog-driven choices for the form's current worker. */
export interface ProfileEditorChoices {
  /**
   * The catalog entry for the form's provider. The model, mode and thinking
   * pickers apply only when it is known; otherwise those fields stay free
   * text, so a profile whose provider the catalog lacks remains editable.
   */
  entry: ProviderEntry | undefined;
  providers: ProfileChoice[];
  models: ProfileChoice[];
  thinking: ProfileChoice[];
  /** Elevated modes carry the "elevated" detail. */
  modes: ProfileChoice[];
  /** The mode field's helper: the chosen mode's description and the ceiling. */
  modeHelper: string;
}

const CEILING_NOTE = "The Conductor's own permission ceiling always applies.";

export function profileEditorChoices(
  catalog: ProviderCatalog | undefined,
  form: Pick<ProfileForm, "provider" | "model" | "modeId">,
): ProfileEditorChoices {
  const entry = catalog?.providers.find(
    (provider) => provider.id === form.provider,
  );
  const model = entry?.models.find((item) => item.id === form.model);
  const mode = entry?.modes.find((item) => item.id === form.modeId);
  return {
    entry,
    providers:
      catalog?.providers.map((provider) => ({
        value: provider.id,
        label: provider.label,
        detail: provider.available ? undefined : "unavailable",
      })) ?? [],
    models:
      entry?.models.map((item) => ({
        value: item.id,
        label: item.label,
        detail: item.isDefault ? "default" : undefined,
      })) ?? [],
    thinking:
      model?.thinkingOptions.map((option) => ({
        value: option.id,
        label: option.label,
        detail: option.isDefault ? "default" : undefined,
      })) ?? [],
    modes:
      entry?.modes.map((item) => ({
        value: item.id,
        label: item.label,
        detail: item.elevated ? "elevated" : undefined,
      })) ?? [],
    modeHelper: mode?.description
      ? `${mode.description} ${CEILING_NOTE}`
      : CEILING_NOTE,
  };
}

/** The line under the role chips: what routing does with the current choice. */
export function profileRolesNote(
  form: Pick<ProfileForm, "roles" | "size">,
  mode: RoutingMode,
): string {
  if (form.roles.length === 0) {
    return `Routing never picks this profile. Enforce routing is ${mode === "strict" ? "on" : "off"}.`;
  }
  const roles =
    form.roles.length === 1 ? "one role" : `${form.roles.length} roles`;
  return `Routing considers this profile for ${roles}${form.size ? " and its size" : " once a size is set"}.`;
}
