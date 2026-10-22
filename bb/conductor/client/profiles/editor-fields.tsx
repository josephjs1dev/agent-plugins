import type { ProviderCatalog } from "conductor/symphonies/profiles-contracts";
import type { RoutingMode } from "conductor/symphonies/routing";
import {
  PROFILE_ROLES,
  PROFILE_SIZES,
  toggleRole,
  withModel,
  withProvider,
  type ProfileForm,
  type ProfileFormErrors,
} from "conductor/podium/profiles-draft";
import {
  profileEditorChoices,
  profileRolesNote,
} from "conductor/podium/profiles-view";
import { ROLE_LABELS, sizeLabel } from "conductor/podium/roles";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "../ui/notice";
import {
  Field,
  ProfilePicker,
  Segmented,
  ToggleChip,
  fieldIds,
} from "./controls";

interface FieldsProps {
  form: ProfileForm;
  errors: ProfileFormErrors;
  onChange(this: void, form: ProfileForm): void;
}

/** A free-text field for a worker id the catalog cannot offer. */
function TextField({
  id,
  label,
  helper,
  error,
  value,
  onChange,
}: {
  id: string;
  label: string;
  helper?: string | undefined;
  error?: string | undefined;
  value: string;
  onChange(this: void, value: string): void;
}) {
  return (
    <Field id={id} label={label} helper={helper} error={error}>
      <Input
        {...fieldIds(id, { helper, error })}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

/**
 * Provider, model, mode and thinking. Pickers read the provider catalog;
 * when the catalog lacks the provider, the fields stay free text so a
 * profile whose provider is not offered here remains editable.
 */
export function WorkerFields({
  form,
  errors,
  onChange,
  catalog,
}: FieldsProps & { catalog: ProviderCatalog | undefined }) {
  const choices = profileEditorChoices(catalog, form);
  const set = (field: keyof ProfileForm) => (value: string) =>
    onChange({ ...form, [field]: value });
  const providerHelper =
    choices.providers.length > 0
      ? undefined
      : "The provider catalog is not loaded; the id is kept as typed.";
  return (
    <>
      {choices.providers.length > 0 ? (
        <Field id="profile-provider" label="Provider" error={errors.provider}>
          <ProfilePicker
            id="profile-provider"
            notes={{ error: errors.provider }}
            options={choices.providers}
            value={form.provider}
            onSelect={(value) => onChange(withProvider(form, value))}
          />
        </Field>
      ) : (
        <TextField
          id="profile-provider"
          label="Provider"
          helper={providerHelper}
          error={errors.provider}
          value={form.provider}
          onChange={set("provider")}
        />
      )}
      {choices.entry ? (
        <>
          <Field id="profile-model" label="Model" error={errors.model}>
            <ProfilePicker
              id="profile-model"
              notes={{ error: errors.model }}
              options={choices.models}
              value={form.model}
              onSelect={(value) => onChange(withModel(form, value))}
            />
          </Field>
          <Field
            id="profile-mode"
            label="Mode"
            helper={choices.modeHelper}
            error={errors.modeId}
          >
            <ProfilePicker
              id="profile-mode"
              notes={{ helper: choices.modeHelper, error: errors.modeId }}
              options={choices.modes}
              value={form.modeId}
              onSelect={set("modeId")}
            />
          </Field>
          <Field
            id="profile-thinking"
            label="Thinking"
            error={errors.thinkingOptionId}
          >
            <ProfilePicker
              id="profile-thinking"
              notes={{ error: errors.thinkingOptionId }}
              options={choices.thinking}
              value={form.thinkingOptionId}
              onSelect={set("thinkingOptionId")}
            />
          </Field>
        </>
      ) : (
        <>
          <TextField
            id="profile-model"
            label="Model"
            helper="Not offered by the provider catalog; kept exactly as typed."
            error={errors.model}
            value={form.model}
            onChange={set("model")}
          />
          <TextField
            id="profile-mode"
            label="Mode"
            helper={choices.modeHelper}
            error={errors.modeId}
            value={form.modeId}
            onChange={set("modeId")}
          />
          <TextField
            id="profile-thinking"
            label="Thinking"
            error={errors.thinkingOptionId}
            value={form.thinkingOptionId}
            onChange={set("thinkingOptionId")}
          />
        </>
      )}
    </>
  );
}

/** Roles and size: what routing may pick this profile for. */
export function RoutingFields({
  form,
  onChange,
  mode,
}: Omit<FieldsProps, "errors"> & { mode: RoutingMode }) {
  return (
    <>
      <SectionLabel>Routing</SectionLabel>
      <div className="space-y-1.5">
        <p id="profile-roles-label" className="text-xs text-muted-foreground">
          Roles
        </p>
        <div
          role="group"
          aria-labelledby="profile-roles-label"
          aria-describedby="profile-roles-note"
          className="flex flex-wrap gap-2"
        >
          {PROFILE_ROLES.map((role) => (
            <ToggleChip
              key={role}
              label={ROLE_LABELS[role]}
              pressed={form.roles.includes(role)}
              onToggle={() => onChange(toggleRole(form, role))}
              data-profile-role={role}
            />
          ))}
        </div>
        <p
          id="profile-roles-note"
          className="text-[11px] text-muted-foreground"
        >
          {profileRolesNote(form, mode)}
        </p>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Size</p>
        <Segmented
          label="Size"
          options={PROFILE_SIZES.map((size) => ({
            value: size,
            label: sizeLabel(size),
            accessibleLabel: `${sizeLabel(size)} size`,
          }))}
          value={form.size}
          onChange={(size) => onChange({ ...form, size })}
        />
        <p className="text-[11px] text-muted-foreground">
          Your rating of the model's cost and strength. For a role, the
          Conductor tries smaller sizes first.
        </p>
      </div>
    </>
  );
}
