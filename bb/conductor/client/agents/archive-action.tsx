import { useState } from "react";
import type { AgentItem, ArchiveResult } from "conductor/agents/models";
import { archiveErrors } from "conductor/podium/agents";
import {
  AGENTS_COPY,
  archiveBlocked,
  archivePrompts,
  canArchive,
} from "conductor/podium/agents-view";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

const errors = archiveErrors("bb");
const prompts = archivePrompts("bb");

interface Props {
  item: AgentItem;
  stale: boolean;
  directoryIncomplete: boolean;
  archive(this: void, item: AgentItem): Promise<ArchiveResult>;
}

/**
 * Archives an inactive agent after an inline confirmation. An unconfirmed
 * archive stays blocked until the item changes (the parent remounts it by
 * archive key), so an uncertain archive is never retried blindly.
 */
export function ArchiveAction({
  item,
  stale,
  directoryIncomplete,
  archive,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  if (!canArchive(item)) {
    return null;
  }
  const blocked = archiveBlocked(item, {
    stale,
    directoryIncomplete,
    busy,
    uncertain,
  });
  const perform = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await archive(item);
      if (result.status !== "archived") {
        setError(errors[result.status]);
        setUncertain(result.status === "unknown");
      }
    } catch {
      setError(errors.unknown);
      setUncertain(true);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };
  return (
    <div className="space-y-2">
      {confirming ? (
        <>
          <p className="text-sm">{prompts.confirm(item.agentTitle)}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={blocked}
              onClick={() => {
                perform().catch(() => undefined);
              }}
            >
              {busy ? "Archiving…" : "Confirm archive"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancel archive
            </Button>
          </div>
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={blocked}
          onClick={() => setConfirming(true)}
        >
          <Icon name="Archive" aria-hidden />
          Archive agent
        </Button>
      )}
      {item.childAgentCount > 0 && (
        <p className="text-xs text-muted-foreground">{prompts.children}</p>
      )}
      {directoryIncomplete && (
        <p className="text-xs text-muted-foreground">
          {AGENTS_COPY.archiveIncomplete}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
