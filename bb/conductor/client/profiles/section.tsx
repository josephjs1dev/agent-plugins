import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { usePodium, useViewState } from "../podium/context";
import { useElementWidth } from "../ui/use-element-width";
import { StatusNotice } from "./controls";
import { ProfileEditor } from "./editor";
import { ProfileRow, ProfilesPanel } from "./list";
import { useProfiles } from "./query";

/** Below this width the section shows the list or the editor, not both. */
const COMPACT_WIDTH = 740;

/** A calm placeholder for the editor column. */
function PanelIntro({
  title,
  body,
  detail,
}: {
  title: string;
  body: string;
  detail: string;
}) {
  return (
    <div className="max-w-[620px] space-y-2.5 p-7">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-foreground">{body}</p>
      <p className="text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

/**
 * The worker profile cards beside a form editor. The list column owns the
 * population controls; the editor column owns one profile at a time, or a
 * new one. A compact pane shows the list, or the editor with a way back.
 */
export function ProfilesSection() {
  const { session } = usePodium();
  const { profileSelection } = useViewState();
  const data = useProfiles();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const compact = width > 0 && width < COMPACT_WIDTH;
  const [creating, setCreating] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  /**
   * The card warning's Fix action: an advancing tick per activation, so an
   * open editor re-focuses Routing when it fires again. Ordinary openings
   * clear it, so a later open never inherits a stale routing hint.
   */
  const [routingFocus, setRoutingFocus] = useState<{
    id: string;
    tick: number;
  }>();
  const profiles = data.state?.profiles ?? [];
  const mode = data.state?.mode ?? "warn";
  const selected =
    profiles.find((profile) => profile.id === profileSelection) ?? null;
  const visible = Boolean(profileSelection) || creating;

  const openProfile = (id: string): void => {
    setCreating(false);
    setFlashId(null);
    setRoutingFocus(undefined);
    session.update({ profileSelection: id });
  };
  const startNew = (): void => {
    setCreating(true);
    setFlashId(null);
    setRoutingFocus(undefined);
    session.update({ profileSelection: null });
  };
  const fixWarning = (id: string): void => {
    setCreating(false);
    setFlashId(null);
    if (profileSelection !== id) {
      session.update({ profileSelection: id });
    }
    setRoutingFocus((previous) =>
      previous?.id === id ? { id, tick: previous.tick + 1 } : { id, tick: 1 },
    );
  };
  const back = (): void => {
    setCreating(false);
    session.update({ profileSelection: null });
  };

  const editor = ((): ReactNode => {
    if (creating && !selected) {
      return (
        <ProfileEditor
          key="profile-new"
          data={data}
          mode={mode}
          profile={null}
          onCreated={(id) => {
            openProfile(id);
            setFlashId(id);
          }}
          onClosed={() => setCreating(false)}
        />
      );
    }
    if (selected) {
      return (
        <ProfileEditor
          key={selected.id}
          data={data}
          mode={mode}
          profile={selected}
          flashSaved={flashId === selected.id}
          routingHint={
            routingFocus?.id === selected.id ? routingFocus.tick : undefined
          }
          onCreated={(id) => {
            openProfile(id);
            setFlashId(id);
          }}
        />
      );
    }
    if (profileSelection) {
      return (
        <PanelIntro
          title="This profile is no longer in the store"
          body="It may have been deleted on this server."
          detail="Reload the profiles list to see the current store."
        />
      );
    }
    return (
      <PanelIntro
        title="Choose a profile to edit, or create a new one"
        body="Profiles choose the worker, its thinking option and permission mode, and carry the instructions each task agent receives."
        detail={`Routing picks the smallest profile that fits the task's role, using the when-to-use notes and the roles and size each profile declares. Enforce routing is ${mode === "strict" ? "on" : "off"}.`}
      />
    );
  })();

  return (
    <div ref={ref} className="flex h-full min-h-0">
      {(!compact || !visible) && (
        <div
          role="region"
          aria-label="Profiles"
          className={cn(
            "min-h-0 space-y-3 overflow-y-auto p-3.5",
            compact ? "flex-1" : "w-[39%] shrink-0 border-r border-border",
          )}
        >
          <ProfilesPanel data={data} mode={mode} onNew={startNew} />
          {data.state?.state === "invalid" && data.state.error && (
            <StatusNotice tone="warning">
              The Conductor profiles store is invalid. Saving a profile from the
              editor replaces it with a valid store. {data.state.error}
            </StatusNotice>
          )}
          {data.loading && (
            <p role="status" className="text-sm text-muted-foreground">
              Loading profiles…
            </p>
          )}
          {!data.loading &&
            !data.stale &&
            data.state?.state !== "invalid" &&
            profiles.length === 0 && (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  Set up your first profile
                </p>
                <p className="text-xs text-muted-foreground">
                  A profile picks a worker provider, model, mode and thinking
                  option, tells the Conductor when routing may choose it, and
                  carries the instructions its task agents receive.
                </p>
              </div>
            )}
          {profiles.map((profile) => (
            <ProfileRow
              key={profile.id}
              profile={profile}
              providers={data.providers}
              selected={profile.id === profileSelection}
              onSelect={() => openProfile(profile.id)}
              onFixWarning={() => fixWarning(profile.id)}
            />
          ))}
        </div>
      )}
      {(!compact || visible) && (
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {compact && (
            <div className="border-b border-border px-3.5 py-2">
              <Button type="button" variant="ghost" size="sm" onClick={back}>
                <Icon name="ArrowLeft" aria-hidden />
                Back to profiles
              </Button>
            </div>
          )}
          {editor}
        </div>
      )}
    </div>
  );
}
