import { useState } from "react";
import type { RoutingMode } from "conductor/symphonies/routing";
import type { ConductorProfile } from "conductor/symphonies/profiles";
import type { ProviderCatalog } from "conductor/symphonies/profiles-contracts";
import { sizeLabel } from "conductor/podium/roles";
import {
  CHECKED_LINES,
  MODE_DESCRIPTION,
  RECHECK_LINE,
  profileCardWarning,
} from "conductor/podium/profiles-view";
import {
  identityLabel,
  profileIdentity,
} from "conductor/podium/worker-identity";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { errorMessage } from "../data";
import { HarnessMark } from "../ui/harness-mark";
import { Disclosure } from "../ui/notice";
import { RoleChip } from "../ui/role-chip";
import { STATUS_TEXT } from "../ui/status";
import { ErrorText, StatusNotice } from "./controls";
import type { ProfilesData } from "./query";

/**
 * The list header: profile creation and the global routing enforcement
 * switch. A rejected mode change and store problems surface here.
 */
export function ProfilesPanel({
  data,
  mode,
  onNew,
}: {
  data: ProfilesData;
  mode: RoutingMode;
  onNew(this: void): void;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showChecked, setShowChecked] = useState(false);
  const strict = mode === "strict";
  const toggleMode = async (): Promise<void> => {
    const expectedRevision = data.state?.revision;
    if (!expectedRevision) {
      setError("Profiles are still loading. Try again.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await data.setMode(
        strict ? "warn" : "strict",
        expectedRevision,
      );
      // A successful change needs no banner: the switch and its description
      // already say what changed.
      if (result.status === "stale") {
        setNotice(`Mode not applied. ${result.message}`);
      }
    } catch (cause) {
      setError(
        errorMessage(cause) ||
          "The action could not be completed. Reload and try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2.5">
      <Button type="button" size="sm" disabled={busy} onClick={onNew}>
        <Icon name="Plus" aria-hidden />
        New profile
      </Button>
      <div className="space-y-1 border-b border-border pb-3">
        <div className="flex items-center gap-2.5 py-1">
          <Switch
            id="profiles-enforce-routing"
            checked={strict}
            disabled={busy}
            onCheckedChange={() => {
              toggleMode().catch(() => undefined);
            }}
          />
          <Label
            htmlFor="profiles-enforce-routing"
            className="text-sm font-semibold"
          >
            Enforce routing
          </Label>
        </div>
        <div className="max-w-[680px] space-y-0.5 pl-[38px]">
          <p className="text-xs text-muted-foreground">
            {MODE_DESCRIPTION[mode]}
          </p>
          <Disclosure
            label="Learn what's checked"
            expanded={showChecked}
            onToggle={() => setShowChecked((value) => !value)}
          >
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              {[...CHECKED_LINES[mode], RECHECK_LINE].map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Disclosure>
        </div>
      </div>
      {notice && (
        <StatusNotice tone="warning" onDismiss={() => setNotice(null)}>
          {notice}
        </StatusNotice>
      )}
      {error && <ErrorText>{error}</ErrorText>}
      {data.stale && (
        <StatusNotice tone="warning">
          Could not load the Conductor profiles. Refresh to check them again.
        </StatusNotice>
      )}
    </div>
  );
}

/**
 * One profile card: a noninteractive container with two sibling buttons.
 * Its name, when-to-use notes, worker line, role chips, size badge and
 * instructions indicator are display content; Edit opens the editor and the
 * warning row's Fix opens it at Routing.
 */
export function ProfileRow({
  profile,
  providers,
  selected,
  onSelect,
  onFixWarning,
}: {
  profile: ConductorProfile;
  providers: ProviderCatalog | undefined;
  selected: boolean;
  onSelect(this: void): void;
  /** Selects this profile and opens its editor at Routing. */
  onFixWarning(this: void): void;
}) {
  const warning = profileCardWarning(profile, providers);
  const identity = profileIdentity(profile, providers);
  const roles = profile.routing?.roles ?? [];
  const size = profile.routing?.size;
  return (
    <article
      aria-label={profile.name}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "space-y-1.5 rounded-lg border p-3 focus-within:border-ring",
        selected
          ? "border-foreground/40 bg-state-active"
          : "border-border bg-background",
      )}
    >
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {profile.name}
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 rounded-full px-2.5"
          aria-label={`Edit profile: ${profile.name}`}
          aria-pressed={selected}
          onClick={onSelect}
        >
          Edit
        </Button>
      </div>
      {profile.notes.length > 0 && (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {profile.notes}
        </p>
      )}
      <div className="flex min-w-0 items-center gap-1.5 text-xs text-foreground">
        <HarnessMark
          provider={identity.provider ?? profile.provider}
          {...(identity.providerLabel ? { label: identity.providerLabel } : {})}
        />
        {/* The mark names the provider for sighted users; the label covers
            assistive technology, and raw ids stand in for unknown entries. */}
        <span className="sr-only">{identityLabel(identity)}</span>
        <span aria-hidden className="truncate">
          {[identity.modelLabel, identity.thinkingLabel]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      {(roles.length > 0 || size !== undefined) && (
        <div className="flex flex-wrap gap-1.5">
          {roles.map((role) => (
            <RoleChip key={role} role={role} />
          ))}
          {size !== undefined && (
            <span className="inline-flex min-h-[22px] items-center rounded-full bg-muted px-2 text-[11px] font-semibold text-foreground">
              {sizeLabel(size)}
            </span>
          )}
        </div>
      )}
      {profile.instructions.length > 0 && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Icon
            name="FileText"
            fallback="Info"
            aria-hidden
            className="size-3"
          />
          Has instructions
        </p>
      )}
      {warning && (
        <button
          type="button"
          aria-label={`Fix ${profile.name} routing: open routing to fix, ${warning}`}
          onClick={onFixWarning}
          className={cn(
            "mt-0.5 flex w-full items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-left text-xs font-medium hover:bg-amber-500/15 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
            STATUS_TEXT.statusWarning,
          )}
        >
          <Icon
            name="AlertTriangle"
            aria-hidden
            className="size-3.5 shrink-0"
          />
          <span className="min-w-0 flex-1">{warning}</span>
          <span
            aria-hidden
            className="inline-flex items-center gap-0.5 font-semibold"
          >
            Fix
            <Icon name="ChevronRight" aria-hidden className="size-3.5" />
          </span>
        </button>
      )}
    </article>
  );
}
