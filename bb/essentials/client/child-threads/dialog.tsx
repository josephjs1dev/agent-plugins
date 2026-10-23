import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  describePlan,
  describeResult,
  type CleanupPlan,
} from "../../shared/child-threads";
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
import { errorMessage, useCall } from "../data";

const LISTED = 8;

interface Pending {
  threadId: string;
  plan: CleanupPlan;
}

/**
 * Thread menus hold no React state, so the confirmation lives here and the
 * app overlay renders it. One dialog serves the whole app.
 */
let pending: Pending | null = null;
const listeners = new Set<() => void>();

function setPending(next: Pending | null) {
  pending = next;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Asks the user to confirm `plan` for the child threads of `threadId`. */
export function confirmCleanup(threadId: string, plan: CleanupPlan) {
  setPending({ threadId, plan });
}

export function CleanupDialog() {
  const current = useSyncExternalStore(subscribe, () => pending);
  const call = useCall();
  const [busy, setBusy] = useState(false);
  if (!current) {
    return null;
  }
  const { threadId, plan } = current;
  const remove = plan.action === "delete";
  const words = remove
    ? { verb: "Delete", busy: "Deleting…" }
    : { verb: "Archive", busy: "Archiving…" };
  const listed = plan.targets.slice(0, LISTED);
  const more = plan.targets.length - listed.length;

  async function run() {
    setBusy(true);
    try {
      const result = await call("child_threads.run", {
        threadId,
        action: plan.action,
        threadIds: plan.targets.map((target) => target.id),
      });
      const message = describeResult(result);
      if (result.failed.length) {
        toast.error(message);
      } else {
        toast.success(message);
      }
      setPending(null);
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) {
          setPending(null);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{words.verb} idle child threads?</AlertDialogTitle>
          <AlertDialogDescription>
            {describePlan(plan)}
            {remove
              ? " Deleted threads and their files cannot be restored."
              : " You can unarchive them later."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="max-h-48 list-disc overflow-y-auto pl-5 text-sm text-muted-foreground">
          {listed.map((target) => (
            <li key={target.id} className="truncate">
              {target.title}
              {remove && target.archived ? " (archived)" : ""}
            </li>
          ))}
          {more > 0 && <li>and {more} more</li>}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button
            variant={remove ? "destructive" : "default"}
            disabled={busy}
            onClick={() => {
              run().catch(() => undefined);
            }}
          >
            {busy ? words.busy : `${words.verb} ${plan.targets.length}`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
