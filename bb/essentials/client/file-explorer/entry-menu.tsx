import type { KeyboardEvent, MouseEvent } from "react";
import type { FileEntry } from "essentials/file-explorer/browser";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { copyRelativePath, hoverHighlight } from "./ui";

/** A row's menu, opened at a point in the viewport. */
export interface MenuTarget {
  entry: FileEntry;
  x: number;
  y: number;
}

export type OpenMenu = (this: void, target: MenuTarget) => void;

/** Opens the menu at the pointer on a right-click. */
export function menuAtPointer(
  entry: FileEntry,
  onMenu: OpenMenu,
): (event: MouseEvent<HTMLElement>) => void {
  return (event) => {
    event.preventDefault();
    event.stopPropagation();
    onMenu({ entry, x: event.clientX, y: event.clientY });
  };
}

/**
 * Opens the menu below the focused row on the Menu key or Shift+F10.
 * Returns whether it handled the key.
 */
export function menuFromKey(
  event: KeyboardEvent<HTMLElement>,
  entry: FileEntry,
  onMenu: OpenMenu,
): boolean {
  if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  const box = event.currentTarget.getBoundingClientRect();
  onMenu({ entry, x: box.left + 24, y: box.top + 24 });
  return true;
}

/**
 * The right-click menu of a file or folder. An empty trigger at the target
 * point anchors the menu there.
 */
export function EntryMenu({
  target,
  onClose,
  onDelete,
}: {
  target: MenuTarget | null;
  onClose(this: void): void;
  onDelete(this: void, entry: FileEntry): void;
}) {
  if (!target) {
    return null;
  }
  const { entry } = target;
  const name = entry.path.split("/").at(-1) ?? entry.path;
  return (
    <DropdownMenu
      key={`${target.x}:${target.y}:${entry.path}`}
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden="true"
          className="pointer-events-none fixed size-0"
          style={{ left: target.x, top: target.y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" mobileTitle={name}>
        <DropdownMenuItem
          className={hoverHighlight}
          onSelect={() => void copyRelativePath(entry.path)}
        >
          Copy relative path
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          className="hover:bg-destructive/15"
          onSelect={() => onDelete(entry)}
        >
          {entry.kind === "directory" ? "Delete folder…" : "Delete file…"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
