import type { KeyboardEvent } from "react";
import type { FileEntry } from "essentials/file-explorer/browser";
import { gitStatusOf, type GitIndex } from "essentials/file-explorer/git";
import type { ExplorerRoot, ExplorerTarget } from "../../shared/file-explorer";
import { cn } from "@/lib/utils";
import { useQuery } from "../data";
import {
  ErrorNote,
  GitBadge,
  Glyph,
  Muted,
  fileTone,
  gitNameClass,
  hoverHighlight,
  iconButton,
  rowAction,
} from "./ui";
import { menuAtPointer, menuFromKey, type OpenMenu } from "./entry-menu";
import { pageKey } from "./view-state";

export interface TreeProps {
  target: ExplorerTarget;
  /** The note shown when the target has no live checkout. */
  missing: string;
  /** Scopes search to `folder` and its subfolders. */
  onScope(this: void, folder: string): void;
  onOpen(this: void, entry: FileEntry, root: ExplorerRoot): void;
  selected: string | null;
  expanded: ReadonlySet<string>;
  onToggle(this: void, folder: string): void;
  /** The keys of pages whose **Load more** was pressed. */
  pages: readonly string[];
  onPage(this: void, key: string): void;
  showHidden: boolean;
  showIgnored: boolean;
  /** Null outside a Git work tree or before the first status read. */
  git: GitIndex | null;
  onMenu: OpenMenu;
}

const MOVES = new Set(["ArrowDown", "ArrowUp", "Home", "End"]);

/** Moves focus between visible tree items with the arrow, Home, and End keys. */
function moveInTree(event: KeyboardEvent<HTMLLIElement>) {
  if (!MOVES.has(event.key)) {
    return;
  }
  const tree = event.currentTarget.closest('[role="tree"]');
  const items = Array.from(
    tree?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [],
  );
  const index = items.indexOf(event.currentTarget);
  const targets: Record<string, HTMLElement | undefined> = {
    ArrowDown: items[index + 1],
    ArrowUp: items[index - 1],
    Home: items[0],
    End: items.at(-1),
  };
  event.preventDefault();
  event.stopPropagation();
  targets[event.key]?.focus();
}

function TreeNode({
  entry,
  root,
  ...props
}: TreeProps & { entry: FileEntry; root: ExplorerRoot }) {
  const expanded = props.expanded.has(entry.path);
  const directory = entry.kind === "directory";
  const selected = !directory && props.selected === entry.path;
  const name = entry.path.split("/").at(-1) ?? entry.path;
  const status = props.git ? gitStatusOf(props.git, entry) : null;
  const activate = () =>
    directory ? props.onToggle(entry.path) : props.onOpen(entry, root);
  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    moveInTree(event);
    if (menuFromKey(event, entry, root.key, props.onMenu)) {
      return;
    }
    const item = event.currentTarget;
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (event.key === "Enter" || event.key === " ") {
      handled();
      activate();
    } else if (event.key === "ArrowRight" && directory) {
      handled();
      if (expanded) {
        item.querySelector<HTMLElement>('[role="treeitem"]')?.focus();
      } else {
        props.onToggle(entry.path);
      }
    } else if (event.key === "ArrowLeft") {
      handled();
      if (directory && expanded) {
        props.onToggle(entry.path);
      } else {
        item.parentElement?.closest<HTMLElement>('[role="treeitem"]')?.focus();
      }
    }
  };
  return (
    <li
      role="treeitem"
      aria-label={name}
      aria-expanded={directory ? expanded : undefined}
      aria-selected={selected}
      tabIndex={0}
      className="rounded outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onKeyDown={onKeyDown}
    >
      <div
        className={cn(
          "group flex min-w-0 items-center rounded",
          hoverHighlight,
          selected && "bg-state-active",
        )}
        onContextMenu={menuAtPointer(entry, root.key, props.onMenu)}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label={name}
          title={entry.path}
          onClick={(event) => {
            event.currentTarget
              .closest<HTMLElement>('[role="treeitem"]')
              ?.focus();
            activate();
          }}
          className="flex h-7 min-w-0 flex-1 items-center gap-1.5 px-1.5 text-left text-xs"
        >
          <Glyph
            name="chevron"
            className={cn(
              "size-3 text-muted-foreground transition-transform",
              !directory && "invisible",
              expanded && "rotate-90",
            )}
          />
          <Glyph
            name={directory ? "folder" : "file"}
            className={cn(
              directory ? "text-amber-500/90" : fileTone(entry.path),
              status === "ignored" && "opacity-50",
            )}
          />
          <span className={cn("truncate", gitNameClass(status))}>{name}</span>
        </button>
        <GitBadge status={status} directory={directory} />
        {directory ? (
          <button
            type="button"
            aria-label={`Search in ${entry.path}`}
            title="Search this folder and subfolders"
            onClick={() => props.onScope(entry.path)}
            className={cn(iconButton, rowAction, "size-6")}
          >
            <Glyph name="search" className="size-3" />
          </button>
        ) : null}
      </div>
      {directory && expanded ? (
        <ul role="group" className="ml-[11px] border-l border-border/60 pl-2">
          <TreePage {...props} folder={entry.path} after={null} root={root} />
        </ul>
      ) : null}
    </li>
  );
}

/**
 * One page of a folder's entries, then a **Load more** button that mounts the
 * next page. A page from another root than its parent asks for a refresh
 * instead of mixing two checkouts.
 */
export function TreePage({
  folder,
  after,
  root,
  ...props
}: TreeProps & {
  folder: string;
  after: FileEntry | null;
  root?: ExplorerRoot;
}) {
  const key = pageKey(folder, after);
  const more = props.pages.includes(key);
  const page = useQuery("file_explorer.list", {
    target: props.target,
    folder,
    showHidden: props.showHidden,
    showIgnored: props.showIgnored,
    filter: "",
    after,
  });
  const data = page.data;
  if (!data && page.error) {
    return (
      <li role="none" className="px-3 py-2">
        <ErrorNote>{page.error}</ErrorNote>
        <button
          type="button"
          onClick={page.refetch}
          className="mt-1 text-xs text-primary"
        >
          Try again
        </button>
      </li>
    );
  }
  if (!data) {
    return (
      <li
        role="none"
        className="space-y-2 px-3 py-2"
        aria-label="Loading files"
      >
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="h-3 w-2/3 animate-pulse rounded bg-muted"
          />
        ))}
      </li>
    );
  }
  const current = data.root;
  if (!current) {
    return (
      <li role="none" className="px-3 py-4">
        <Muted>{props.missing}</Muted>
      </li>
    );
  }
  if (root && root.key !== current.key) {
    return (
      <li role="none" className="px-3 py-2">
        <Muted>Workspace changed. Refresh to reload.</Muted>
      </li>
    );
  }
  return (
    <>
      {data.entries.map((entry) => (
        <TreeNode key={entry.path} {...props} entry={entry} root={current} />
      ))}
      {data.entries.length === 0 ? (
        <li role="none" className="px-7 py-1.5">
          <Muted>This folder is empty.</Muted>
        </li>
      ) : null}
      {page.error ? (
        <li role="none">
          <ErrorNote>{page.error}</ErrorNote>
        </li>
      ) : null}
      {data.next && more ? (
        <TreePage {...props} folder={folder} after={data.next} root={current} />
      ) : null}
      {data.next && !more ? (
        <li role="none">
          <button
            type="button"
            onClick={() => props.onPage(key)}
            className="ml-7 rounded px-2 py-1.5 text-xs text-primary hover:bg-state-hover"
          >
            Load more
          </button>
        </li>
      ) : null}
    </>
  );
}
