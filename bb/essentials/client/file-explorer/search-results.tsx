import { parentFolder, type FileEntry } from "essentials/file-explorer/browser";
import {
  gitStatusOf,
  type GitIndex,
  type GitStatus,
} from "essentials/file-explorer/git";
import { cn } from "@/lib/utils";
import type { ExplorerRoot, ExplorerTarget } from "../../shared/file-explorer";
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

/** Files in `folder` and its subfolders whose path matches `query`. */
export function SearchResults({
  target,
  missing,
  folder,
  query,
  sessionId,
  showHidden,
  showIgnored,
  git,
  onOpen,
  onScope,
  onMenu,
}: {
  target: ExplorerTarget;
  missing: string;
  folder: string;
  query: string;
  sessionId: string;
  onOpen(this: void, entry: FileEntry, root: ExplorerRoot): void;
  onScope(this: void, folder: string): void;
  showHidden: boolean;
  showIgnored: boolean;
  git: GitIndex | null;
  onMenu: OpenMenu;
}) {
  const result = useQuery("file_explorer.search", {
    target,
    folder,
    showHidden,
    showIgnored,
    query,
    sessionId,
  });
  const data = result.data;
  if (result.error) {
    return (
      <div className="p-3">
        <ErrorNote>Search failed: {result.error}</ErrorNote>
        <button
          type="button"
          onClick={result.refetch}
          className="mt-2 text-xs text-primary"
        >
          Try again
        </button>
      </div>
    );
  }
  if (!data) {
    return <Searching />;
  }
  const root = data.root;
  if (!root) {
    return (
      <div className="p-3">
        <Muted>{missing}</Muted>
      </div>
    );
  }
  const count = data.entries.length;
  return (
    <>
      <p role="status" className="px-2 pb-2 text-[11px] text-muted-foreground">
        {count} {count === 1 ? "file" : "files"} found
        {data.truncated ? " · showing the best matches" : ""}
      </p>
      {data.limited ? (
        <div className="px-2 pb-2">
          <Muted>
            Some folders could not be searched. Choose a narrower folder to
            search more.
          </Muted>
        </div>
      ) : null}
      {data.truncated ? (
        <div className="px-2 pb-2">
          <Muted>Refine your search to see more matches.</Muted>
        </div>
      ) : null}
      {count === 0 ? (
        <div className="px-2 py-5 text-center">
          <Glyph
            name="search"
            className="mx-auto mb-2 size-6 text-muted-foreground/50"
          />
          <p className="text-sm">No matching files</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try a filename, extension, or part of its path.
          </p>
        </div>
      ) : null}
      <ul aria-label="Search results" className="space-y-0.5">
        {data.entries.map((entry) => (
          <ResultRow
            key={entry.path}
            entry={entry}
            rootKey={root.key}
            status={git ? gitStatusOf(git, entry) : null}
            onOpen={() => onOpen(entry, root)}
            onScope={onScope}
            onMenu={onMenu}
          />
        ))}
      </ul>
    </>
  );
}

export function Searching() {
  return (
    <div role="status" className="p-3 text-xs text-muted-foreground">
      Searching subfolders…
    </div>
  );
}

function ResultRow({
  entry,
  rootKey,
  status,
  onOpen,
  onScope,
  onMenu,
}: {
  entry: FileEntry;
  rootKey: string;
  status: GitStatus | null;
  onOpen(this: void): void;
  onScope(this: void, folder: string): void;
  onMenu: OpenMenu;
}) {
  return (
    <li
      className={cn("group flex min-w-0 items-center rounded", hoverHighlight)}
      onContextMenu={menuAtPointer(entry, rootKey, onMenu)}
      onKeyDown={(event) => {
        menuFromKey(event, entry, rootKey, onMenu);
      }}
    >
      <button
        type="button"
        aria-label={`Open ${entry.path}`}
        title={entry.path}
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-2 rounded px-2 py-2 text-left"
      >
        <Glyph
          name="file"
          className={cn(
            "mt-0.5",
            fileTone(entry.path),
            status === "ignored" && "opacity-50",
          )}
        />
        <span className="min-w-0">
          <span
            className={cn(
              "block truncate text-xs font-medium",
              gitNameClass(status),
            )}
          >
            {entry.path.split("/").at(-1)}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {parentFolder(entry.path) || "Root folder"}
          </span>
        </span>
      </button>
      <GitBadge status={status} directory={false} />
      <button
        type="button"
        aria-label={`Open containing folder of ${entry.path}`}
        title="Open containing folder"
        onClick={() => onScope(parentFolder(entry.path))}
        className={cn(iconButton, rowAction, "mr-1")}
      >
        <Glyph name="folder" className="size-3.5" />
      </button>
    </li>
  );
}
