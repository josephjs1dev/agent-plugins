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
  /** The `ExplorerRoot.key` of the row's listing. */
  rootKey: string;
  x: number;
  y: number;
}

export type OpenMenu = (this: void, target: MenuTarget) => void;

/** Opens the menu at the pointer on a right-click. */
export function menuAtPointer(
  entry: FileEntry,
  rootKey: string,
  onMenu: OpenMenu,
): (event: MouseEvent<HTMLElement>) => void {
  return (event) => {
    event.preventDefault();
    event.stopPropagation();
    onMenu({ entry, rootKey, x: event.clientX, y: event.clientY });
  };
}

/**
 * Opens the menu below the focused row on the Menu key or Shift+F10.
 * Returns whether it handled the key.
 */
export function menuFromKey(
  event: KeyboardEvent<HTMLElement>,
  entry: FileEntry,
  rootKey: string,
  onMenu: OpenMenu,
): boolean {
  if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  const box = event.currentTarget.getBoundingClientRect();
  onMenu({ entry, rootKey, x: box.left + 24, y: box.top + 24 });
  return true;
}

/**
 * The right-click menu of a file or folder. An empty trigger at the target
 * point anchors the menu there. A folder gets **Search in folder** when
 * `onSearch` is set, and **Delete** shows when `onDelete` is set.
 */
export function EntryMenu({
  target,
  onClose,
  onSearch,
  onDelete,
}: {
  target: MenuTarget | null;
  onClose(this: void): void;
  onSearch?: (this: void, folder: string) => void;
  onDelete?: (this: void, target: MenuTarget) => void;
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
        {onSearch && entry.kind === "directory" ? (
          <DropdownMenuItem
            className={hoverHighlight}
            onSelect={() => onSearch(entry.path)}
          >
            Search in folder
          </DropdownMenuItem>
        ) : null}
        {onDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              className="hover:bg-destructive/15"
              onSelect={() => onDelete(target)}
            >
              {entry.kind === "directory" ? "Delete folder…" : "Delete file…"}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
