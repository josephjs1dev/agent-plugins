import { useState } from "react";
import { toast } from "sonner";
import type { FileEntry } from "essentials/file-explorer/browser";
import type { ExplorerTarget } from "../../shared/file-explorer";
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
import type { MenuTarget } from "./entry-menu";

/**
 * Asks before it permanently deletes the menu's entry, then deletes it on
 * the host, in the root that the user saw.
 */
export function DeleteDialog({
  target,
  deleting,
  onClose,
  onDeleted,
}: {
  target: ExplorerTarget;
  deleting: MenuTarget | null;
  onClose(this: void): void;
  onDeleted(this: void, entry: FileEntry): void;
}) {
  const call = useCall();
  const [busy, setBusy] = useState(false);
  if (!deleting) {
    return null;
  }
  const { entry, rootKey } = deleting;
  const folder = entry.kind === "directory";
  const name = entry.path.split("/").at(-1) ?? entry.path;

  async function remove(removed: FileEntry) {
    setBusy(true);
    try {
      await call("file_explorer.delete", { target, rootKey, entry: removed });
      toast.success(`Deleted ${removed.path}.`);
      onDeleted(removed);
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
          onClose();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {folder ? "folder" : "file"} “{name}”?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {folder
              ? `This permanently deletes ${entry.path} and everything in it.`
              : `This permanently deletes ${entry.path}.`}{" "}
            It does not go to the Trash, and you cannot undo it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => {
              remove(entry).catch(() => undefined);
            }}
          >
            {busy ? "Deleting…" : "Delete"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
