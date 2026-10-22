import { useState } from "react";
import { experimental_ProviderIcon as ProviderIcon } from "@get-bb/plugin-sdk/app";
import {
  cliNames,
  type CliId,
  type CliStatus,
} from "essentials/cli-maintenance";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ICONS } from "../../shared/icons";

/** bb agent provider IDs for the CLI logos. */
export const PROVIDER_IDS: Record<CliId, string> = {
  codex: "codex",
  claude: "claude-code",
  opencode: "opencode",
  pi: "pi",
};

export function CliLogo({ id }: { id: CliId }) {
  return (
    <ProviderIcon
      providerKind="agent"
      provider={{ id: PROVIDER_IDS[id] }}
      className="size-4 shrink-0"
      aria-hidden
    />
  );
}

interface CliRowProps {
  row: CliStatus;
  busy: boolean;
  updating: boolean;
  onUpdate(this: void): void;
}

/** One CLI's installed and latest versions, with a confirmed update. */
export function CliRow({ row, busy, updating, onUpdate }: CliRowProps) {
  const [confirming, setConfirming] = useState(false);
  const current = row.message === "Up to date";
  const showDetail = !current && row.message !== "Update available";
  const name = cliNames[row.id];
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <CliLogo id={row.id} />
          <span className="text-sm font-semibold">{name}</span>
          {current && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Icon name={ICONS.check} aria-hidden className="size-3" />
              Up to date
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {row.installed ?? "Unavailable"}
          {row.canUpdate && row.latest ? ` → ${row.latest}` : ""}
        </p>
        {row.executable && (
          <p className="truncate text-xs text-muted-foreground">
            {row.method} · <span className="font-mono">{row.executable}</span>
          </p>
        )}
        {showDetail && (
          <p className="text-xs text-muted-foreground">{row.message}</p>
        )}
      </div>
      {(row.canUpdate || updating) && (
        <Button
          size="sm"
          disabled={busy}
          aria-label={`${updating ? "Updating" : "Update"} ${name}`}
          onClick={() => setConfirming(true)}
        >
          <Icon name={ICONS.download} aria-hidden />
          {updating ? "Updating…" : `Update to ${row.latest ?? ""}`}
        </Button>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Update {name} to {row.latest}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Finish active work in bb threads that use {name} first. Running
              threads may need reopening to use the new version.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              onClick={() => {
                setConfirming(false);
                onUpdate();
              }}
            >
              Update
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
