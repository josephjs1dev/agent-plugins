import { useCallback, useEffect, useRef, useState } from "react";
import {
  STALE_SAVE_MESSAGE,
  type ConductorProfile,
  type ProfileDraft,
} from "conductor/symphonies/profiles";
import type { RoutingMode } from "conductor/symphonies/routing";
import {
  duplicateProfileForm,
  newProfileForm,
  profileDraftFromForm,
  profileFormFor,
  profileFormKey,
  routingFocusTarget,
  savedProfileForm,
  validateProfileForm,
  type ProfileForm,
  type ProfileFormErrors,
} from "conductor/podium/profiles-draft";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "../data";
import { usePodium } from "../podium/context";
import { SectionLabel } from "../ui/notice";
import { ErrorText, Field, StatusNotice, fieldIds } from "./controls";
import { RoutingFields, WorkerFields } from "./editor-fields";
import type { ProfilesData } from "./query";

const NOTES_HELPER = "Helps the Conductor choose this profile.";
const INSTRUCTIONS_HELPER =
  "Delivered to every task agent using this profile. Put skill names here.";

/** Focuses the control that can unblock routing and scrolls it into view. */
function focusRouting(section: HTMLElement | null, form: ProfileForm): void {
  if (!section) {
    return;
  }
  const focus = routingFocusTarget(form);
  let selector = "[data-profile-role]";
  if (focus.kind === "size") {
    selector = focus.size
      ? `[data-profile-size="${focus.size}"]`
      : "[data-profile-size]";
  }
  const target =
    section.querySelector<HTMLElement>(selector) ??
    section.querySelector<HTMLElement>("[data-profile-role]");
  section.scrollIntoView({ block: "nearest" });
  target?.focus();
}

/**
 * The editor for one worker profile, or a new one when `profile` is null.
 * Validation runs on save. A stale save keeps the typed text and offers a
 * reload. The server re-checks everything and owns the store's ids.
 */
export function ProfileEditor({
  data,
  mode,
  profile,
  flashSaved = false,
  routingHint,
  onCreated,
  onClosed,
}: {
  data: ProfilesData;
  /** The global routing mode, shown in the routing helper. */
  mode: RoutingMode;
  /** The profile being edited, or null for a new one. */
  profile: ConductorProfile | null;
  /** Marks a freshly created profile so its saved confirmation shows. */
  flashSaved?: boolean;
  /**
   * A card's Fix action hands the editor an advancing tick: present at
   * mount or changed later, it focuses the Routing section.
   */
  routingHint?: number | undefined;
  onCreated?(this: void, profileId: string): void;
  /** Called when a new profile is cancelled before its first save. */
  onClosed?(this: void): void;
}) {
  const { session } = usePodium();
  const [form, setForm] = useState<ProfileForm>(() =>
    profile ? profileFormFor(profile) : newProfileForm(),
  );
  const [initialForm, setInitialForm] = useState(form);
  const [errors, setErrors] = useState<ProfileFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [stale, setStale] = useState(false);
  const [savedNotice, setSavedNotice] = useState(flashSaved);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  /**
   * The store revision this draft was opened against. Only a successful
   * save or an explicit reload moves it, so a background refresh cannot let
   * a later save clobber the changes it brought in.
   */
  const [baseRevision, setBaseRevision] = useState(
    () => data.state?.revision ?? "",
  );
  const dirty = profileFormKey(form) !== profileFormKey(initialForm);
  const isCreate = form.id === undefined;
  const update = (next: ProfileForm): void => {
    setForm(next);
    setSavedNotice(false);
  };
  const set = (field: "name" | "notes" | "instructions") => (value: string) =>
    update({ ...form, [field]: value });

  const routingRef = useRef<HTMLDivElement>(null);
  const formRef = useRef(form);
  formRef.current = form;
  const focus = useCallback(
    () => focusRouting(routingRef.current, formRef.current),
    [],
  );
  useEffect(() => {
    if (routingHint !== undefined) {
      focus();
    }
  }, [routingHint, focus]);

  const fail = (cause: unknown, fallback: string): void =>
    setError(errorMessage(cause) || fallback);

  const reconcile = async (): Promise<void> => {
    // A reload re-anchors the draft to the current store; the typed text
    // stays and the next save is judged against it.
    try {
      const fresh = await data.refresh();
      if (fresh) {
        setBaseRevision(fresh.revision);
      }
      setStale(false);
    } catch (cause) {
      fail(cause, "The profiles could not be reloaded. Try again.");
    }
  };

  const submit = async (): Promise<void> => {
    const nextErrors = validateProfileForm(form, data.state?.profiles ?? []);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    let draft: ProfileDraft;
    try {
      draft = profileDraftFromForm(form);
    } catch (cause) {
      fail(cause, "The profile is not valid.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await data.save(draft, baseRevision);
      if (result.status !== "saved") {
        setStale(true);
        return;
      }
      setBaseRevision(result.state.revision);
      setStale(false);
      const savedId = result.profileId ?? form.id;
      if (savedId && onCreated && isCreate) {
        onCreated(savedId);
        return;
      }
      const savedForm = savedProfileForm(form, draft, savedId);
      setForm(savedForm);
      setInitialForm(savedForm);
      setSavedNotice(true);
      session.update({ profileSelection: savedForm.id ?? null });
    } catch (cause) {
      fail(cause, "The profile could not be saved. Reload and try again.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!form.id) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await data.remove(form.id, baseRevision);
      if (result.status !== "saved") {
        setStale(true);
        return;
      }
      setBaseRevision(result.state.revision);
      session.update({ profileSelection: null });
    } catch (cause) {
      fail(cause, "The profile could not be deleted. Reload and try again.");
    } finally {
      setSaving(false);
    }
  };

  const resetNotices = (): void => {
    setErrors({});
    setStale(false);
    setSavedNotice(false);
    setError(null);
  };

  const duplicate = (): void => {
    if (!profile) {
      return;
    }
    // A duplicate is a new profile with copied fields; the store assigns
    // its id on save.
    const copy = duplicateProfileForm(profile);
    setForm(copy);
    setInitialForm(copy);
    resetNotices();
  };

  const cancel = (): void => {
    resetNotices();
    if (isCreate && profile) {
      // A cancelled duplicate goes back to the profile it was copied from.
      const original = profileFormFor(profile);
      setForm(original);
      setInitialForm(original);
      return;
    }
    if (isCreate) {
      onClosed?.();
      return;
    }
    // An existing draft goes back to the stored value it was opened with.
    setForm(initialForm);
  };

  return (
    <form
      aria-label={isCreate ? "New profile" : `Edit ${form.name}`}
      className="max-w-[640px] space-y-3.5 p-[18px] pb-12"
      onSubmit={(event) => {
        event.preventDefault();
        submit().catch(() => undefined);
      }}
    >
      <header className="space-y-0.5">
        <h2 className="text-lg font-semibold text-foreground">
          {isCreate ? "New profile" : (profile?.name ?? form.name)}
        </h2>
        <p className="truncate text-[11px] text-muted-foreground tabular-nums">
          {isCreate
            ? "The store assigns the id on the first save."
            : (profile?.id ?? "")}
        </p>
      </header>
      {stale && (
        <StatusNotice
          tone="warning"
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                reconcile().catch(() => undefined);
              }}
            >
              Reload profiles
            </Button>
          }
        >
          {STALE_SAVE_MESSAGE}
        </StatusNotice>
      )}
      {savedNotice && !stale && (
        <StatusNotice tone="success" onDismiss={() => setSavedNotice(false)}>
          Profile saved.
        </StatusNotice>
      )}
      {error && <ErrorText>{error}</ErrorText>}
      <Field id="profile-name" label="Name" error={errors.name}>
        <Input
          {...fieldIds("profile-name", { error: errors.name })}
          value={form.name}
          onChange={(event) => set("name")(event.target.value)}
        />
      </Field>
      <WorkerFields
        form={form}
        errors={errors}
        onChange={update}
        catalog={data.providers}
      />
      <Field
        id="profile-notes"
        label="When to use"
        helper={NOTES_HELPER}
        error={errors.notes}
      >
        <Textarea
          {...fieldIds("profile-notes", {
            helper: NOTES_HELPER,
            error: errors.notes,
          })}
          className="min-h-16"
          value={form.notes}
          onChange={(event) => set("notes")(event.target.value)}
        />
      </Field>
      <div ref={routingRef} className="space-y-3 pt-1.5">
        <RoutingFields form={form} onChange={update} mode={mode} />
      </div>
      <div className="pt-1.5">
        <SectionLabel>Instructions</SectionLabel>
      </div>
      <Field
        id="profile-instructions"
        label="Instructions"
        helper={INSTRUCTIONS_HELPER}
        error={errors.instructions}
      >
        <Textarea
          {...fieldIds("profile-instructions", {
            helper: INSTRUCTIONS_HELPER,
            error: errors.instructions,
          })}
          className="min-h-28"
          value={form.instructions}
          onChange={(event) => set("instructions")(event.target.value)}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        {profile && !isCreate && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={duplicate}
            >
              <Icon name="Copy" aria-hidden />
              Duplicate
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive"
              disabled={saving}
              onClick={() => setConfirmingDelete(true)}
            >
              <Icon name="Trash2" aria-hidden />
              Delete
            </Button>
          </>
        )}
        <div className="min-w-2 flex-1" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={saving}
          onClick={cancel}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={saving || (!dirty && !isCreate)}
        >
          Save
        </Button>
      </div>
      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {form.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Deleting removes this profile from the store.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                remove().catch(() => undefined);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
