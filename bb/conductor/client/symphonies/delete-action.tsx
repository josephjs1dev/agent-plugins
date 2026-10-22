import { useState } from "react";
import {
  deleteRefusal,
  type StoredSymphony,
} from "conductor/symphonies/models";
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
import { errorMessage } from "../data";

/**
 * Deletes a finished symphony after confirmation. The core's refusal rule
 * disables the action and explains why. The dialog stays open on failure so
 * the error shows beside the retry.
 */
export function SymphonyDeleteAction({
  symphony,
  deleteSymphony,
}: {
  symphony: StoredSymphony;
  deleteSymphony(this: void, symphony: StoredSymphony): Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refusal = deleteRefusal(symphony);
  const perform = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteSymphony(symphony);
      setConfirming(false);
    } catch (cause) {
      setError(
        errorMessage(cause) ||
          "The symphony could not be deleted. Refresh the symphony list and try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive"
        disabled={refusal !== null}
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
      >
        <Icon name="Trash2" aria-hidden />
        Delete symphony
      </Button>
      {refusal && <p className="text-xs text-muted-foreground">{refusal}</p>}
      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!busy) {
            setConfirming(open);
            setError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this symphony?</AlertDialogTitle>
            <AlertDialogDescription>
              Its tasks, reports, and history are removed from Conductor. Agents
              and concert files are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                perform().catch(() => undefined);
              }}
            >
              {busy ? "Deleting…" : "Delete symphony"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
