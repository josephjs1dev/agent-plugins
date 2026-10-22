import { useRef, useState } from "react";
import {
  resetOutcomeMessages,
  type ResetAttempt,
} from "essentials/codex-reset";
import type { Usage } from "essentials/usage";
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
import { useCall, type Output } from "../data";

type Result = Output<"usage.codex-reset.consume">;

const ERROR_MESSAGE =
  "Could not confirm the reset. Try again to check the same request without spending an additional credit. Check Codex sign-in and CLI support if this continues.";

/**
 * The prepared attempt outlives the popover, so a retry after an uncertain
 * failure reuses its idempotency key. One Codex account serves the bb host,
 * so one pending attempt is shared by every view.
 */
let pendingAttempt: ResetAttempt | null = null;

function expiryLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** Banked Codex resets: count, expiry, and a confirmed redemption. */
export function CodexReset({
  usage,
  onUsageChange,
}: {
  usage: Usage;
  onUsageChange(this: void, usage: Usage): void;
}) {
  const call = useCall();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const submitting = useRef(false);
  const count = usage.resetCredits?.availableCount;
  const earliestExpiresAt = usage.resetCredits?.earliestExpiresAt;
  const available = usage.status === "ok" && count != null && count > 0;
  const canUse = available || pendingAttempt !== null;

  async function redeem() {
    if (submitting.current) {
      return;
    }
    submitting.current = true;
    setBusy(true);
    setFailed(false);
    try {
      pendingAttempt ??= await call("usage.codex-reset.prepare", {});
      const next = await call("usage.codex-reset.consume", {
        ...pendingAttempt,
        confirmed: true,
      });
      pendingAttempt = null;
      setResult(next);
      onUsageChange(next.usage);
      setOpen(false);
    } catch {
      // Keep the attempt: the server may have spent the credit.
      setFailed(true);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 border-t pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold">Banked resets</p>
          <p className="text-xs text-muted-foreground">
            {count == null
              ? "Unavailable for this account or Codex version"
              : `${count} available · account-wide`}
          </p>
          {earliestExpiresAt && (
            <p className="text-xs text-muted-foreground">
              Earliest expiry: {expiryLabel(earliestExpiresAt)}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!canUse || busy}
          onClick={() => setOpen(true)}
        >
          {busy ? "Using reset…" : "Use reset"}
        </Button>
      </div>
      {result && (
        <p aria-live="polite" className="text-xs">
          {resetOutcomeMessages[result.outcome]}
          {result.usage.status === "unavailable"
            ? " Quota could not be refreshed. Try Refresh shortly."
            : ""}
        </p>
      )}
      {failed && !open && (
        <p role="alert" className="text-xs text-destructive">
          {ERROR_MESSAGE}
        </p>
      )}
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) {
            setOpen(next);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Use one banked reset?</AlertDialogTitle>
            <AlertDialogDescription>
              This spends one banked reset on the Codex account connected to the
              bb host. It resets eligible quota for all sessions using that
              account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">
            {count ?? "Unknown"} available. A spent reset cannot be undone.
          </p>
          {failed && (
            <p role="alert" className="text-sm text-destructive">
              {ERROR_MESSAGE}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              disabled={busy || !canUse}
              onClick={() => {
                redeem().catch(() => undefined);
              }}
            >
              {busy ? "Using reset…" : "Confirm · use 1 reset"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
