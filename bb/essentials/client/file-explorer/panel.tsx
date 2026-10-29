import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  useBbNavigate,
  type PluginNewThreadPanelProps,
  type PluginThreadPanelProps,
} from "@get-bb/plugin-sdk/app";
import { parentFolder, type FileEntry } from "essentials/file-explorer/browser";
import { indexGitStatus } from "essentials/file-explorer/git";
import { cn } from "@/lib/utils";
import type { ExplorerRoot, ExplorerTarget } from "../../shared/file-explorer";
import { requestContentSearch } from "../content-search/state";
import { useQuery } from "../data";
import { CONTENT_SEARCH_ACTION } from "../navigation";
import { DeleteDialog } from "./delete-dialog";
import { EntryMenu, type MenuTarget } from "./entry-menu";
import { Breadcrumbs } from "./breadcrumbs";
import { ExplorerScroll } from "./explorer-scroll";
import { SearchResults, Searching } from "./search-results";
import { TreePage } from "./tree";
import { previewTarget } from "./root";
import { ErrorNote, Glyph, Muted, iconButton } from "./ui";
import {
  capped,
  useExplorerView,
  useShowHidden,
  useShowIgnored,
} from "./view-state";

/** The pause after typing before a search starts. */
const SEARCH_DELAY_MS = 250;
/** How often the Git status refreshes while the Explorer is open. */
const GIT_POLL_MS = 10_000;

/** Whether `path` is `folder` or inside it. */
const isAtOrBelow = (path: string | null, folder: string) =>
  path !== null && (path === folder || path.startsWith(`${folder}/`));

/** The thread side-panel tab. */
export function FileExplorerPanel({ threadId }: PluginThreadPanelProps) {
  const target = useMemo(
    () => ({ kind: "thread" as const, threadId }),
    [threadId],
  );
  return (
    <FileExplorer
      key={threadId}
      target={target}
      viewKey={threadId}
      missing="This thread has no live workspace."
    />
  );
}

/** The New thread screen's tab: it lists the project's default checkout. */
export function NewThreadExplorerPanel({
  projectId,
}: PluginNewThreadPanelProps) {
  const target = useMemo(
    () => (projectId ? { kind: "project" as const, projectId } : null),
    [projectId],
  );
  if (!target) {
    return (
      <div className="p-4">
        <Muted>Select a project to browse its files.</Muted>
      </div>
    );
  }
  return (
    <FileExplorer
      key={projectId}
      target={target}
      viewKey={`project:${target.projectId}`}
      missing="This project has no checkout."
    />
  );
}

function FileExplorer({
  target,
  viewKey,
  missing,
}: {
  target: ExplorerTarget;
  /** The thread ID, or `project:<projectId>`, that keys the stored views. */
  viewKey: string;
  missing: string;
}) {
  const navigate = useBbNavigate();
  // One explorer: the server cancels its older searches, not another window's.
  const [sessionId] = useState(() => globalThis.crypto.randomUUID());
  const input = useRef<HTMLInputElement>(null);
  const [view, updateView] = useExplorerView(viewKey);
  const { scope, draft, selected, pages } = view;
  const expanded = new Set(view.expanded);
  // A restored search shows its results at once, with no typing pause.
  const [search, setSearch] = useState(() => draft.trim());
  const [refresh, setRefresh] = useState(0);
  const [openError, setOpenError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useShowHidden();
  const [showIgnored, setShowIgnored] = useShowIgnored();
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [deleting, setDeleting] = useState<MenuTarget | null>(null);
  const status = useQuery(
    "file_explorer.git_status",
    { target },
    { pollMs: GIT_POLL_MS },
  );
  const git = useMemo(
    () =>
      status.data?.repository ? indexGitStatus(status.data.entries) : null,
    [status.data],
  );
  useEffect(() => {
    const timer = setTimeout(() => setSearch(draft.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft]);
  const setDraft = (next: string) => updateView({ draft: next, scrollTop: 0 });
  const clearSearch = () => {
    setDraft("");
    setSearch("");
  };
  const changeScope = (folder: string) => {
    updateView({ scope: folder, draft: "", scrollTop: 0 });
    setSearch("");
    setOpenError(null);
    input.current?.focus();
  };
  const open = (entry: FileEntry, root: ExplorerRoot) => {
    updateView({ selected: entry.path });
    const opened = navigate.experimental_openFilePreview({
      target: previewTarget(root, entry.path),
      location: null,
    });
    setOpenError(opened ? null : "bb could not open this preview.");
  };
  // Search reads its folder from its stored view and opens with no params,
  // so bb reuses one Search tab.
  const searchContents = (folder: string) => {
    requestContentSearch(viewKey, folder);
    const opened = navigate.openThreadPanel({
      actionId: CONTENT_SEARCH_ACTION,
      title: "Search",
    });
    setOpenError(opened ? null : "bb could not open Search.");
  };
  const toggle = (folder: string) => {
    const next = new Set(expanded);
    if (next.has(folder)) {
      next.delete(folder);
    } else {
      next.add(folder);
    }
    updateView({ expanded: capped([...next]) });
  };
  const reload = () => {
    updateView({ pages: [] });
    setRefresh((value) => value + 1);
    setOpenError(null);
    status.refetch();
  };
  const removed = (entry: FileEntry) => {
    setDeleting(null);
    updateView({
      expanded: view.expanded.filter((path) => !isAtOrBelow(path, entry.path)),
      selected: isAtOrBelow(selected, entry.path) ? null : selected,
    });
    if (isAtOrBelow(scope, entry.path)) {
      changeScope(parentFolder(entry.path));
    }
    reload();
  };
  const searching = draft.trim().length > 0;
  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-col text-foreground"
      aria-label="Explorer"
    >
      <header className="shrink-0 space-y-2 border-b border-border p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Explorer
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              aria-label="Search file contents"
              title={
                scope
                  ? `Search file contents in ${scope}`
                  : "Search file contents"
              }
              className={iconButton}
              onClick={() => searchContents(scope)}
            >
              <Glyph name="find" className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Show hidden files"
              aria-pressed={showHidden}
              title={showHidden ? "Hide hidden files" : "Show hidden files"}
              className={iconButton}
              onClick={() => setShowHidden(!showHidden)}
            >
              <Glyph
                name={showHidden ? "eye" : "eyeOff"}
                className="size-3.5"
              />
            </button>
            <button
              type="button"
              aria-label="Show ignored files"
              aria-pressed={showIgnored}
              title={showIgnored ? "Hide ignored files" : "Show ignored files"}
              className={iconButton}
              onClick={() => setShowIgnored(!showIgnored)}
            >
              <Glyph
                name={showIgnored ? "ignored" : "ignoredOff"}
                className="size-3.5"
              />
            </button>
            <button
              type="button"
              aria-label="Collapse all folders"
              title="Collapse all folders"
              className={iconButton}
              onClick={() => updateView({ expanded: [], scrollTop: 0 })}
            >
              <Glyph name="collapse" className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Refresh files"
              title="Refresh files"
              className={iconButton}
              onClick={reload}
            >
              <Glyph name="refresh" className="size-3.5" />
            </button>
          </div>
        </div>
        <div className="relative">
          <Glyph
            name="search"
            className="pointer-events-none absolute left-2.5 top-2 size-3.5 text-muted-foreground"
          />
          <input
            ref={input}
            type="search"
            aria-label="Search files"
            placeholder="Search files and subfolders…"
            className="h-8 w-full min-w-0 rounded-md border border-input bg-background pl-8 pr-8 text-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
            value={draft}
            maxLength={200}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                clearSearch();
              }
            }}
          />
          {draft ? (
            <button
              type="button"
              aria-label="Clear search"
              className={cn(iconButton, "absolute right-0.5 top-0.5")}
              onClick={() => {
                clearSearch();
                input.current?.focus();
              }}
            >
              <Glyph name="close" className="size-3.5" />
            </button>
          ) : null}
        </div>
        {scope ? (
          <Breadcrumbs
            scope={scope}
            searching={searching}
            onScope={changeScope}
          />
        ) : null}
      </header>
      <ExplorerScroll
        key={`${scope}:${search}`}
        position={view.scrollTop}
        onScroll={(scrollTop) => updateView({ scrollTop })}
      >
        {openError ? (
          <div className="mb-2 px-2">
            <ErrorNote>{openError}</ErrorNote>
          </div>
        ) : null}
        <Body
          searching={searching}
          settled={search === draft.trim()}
          viewKey={[scope, search, refresh, showHidden, showIgnored].join(":")}
        >
          {searching ? (
            <SearchResults
              target={target}
              missing={missing}
              folder={scope}
              query={search}
              sessionId={sessionId}
              showHidden={showHidden}
              showIgnored={showIgnored}
              git={git}
              onOpen={open}
              onScope={changeScope}
              onMenu={setMenu}
            />
          ) : (
            <ul role="tree" aria-label="Explorer">
              <TreePage
                target={target}
                missing={missing}
                folder={scope}
                after={null}
                onScope={changeScope}
                onOpen={open}
                selected={selected}
                expanded={expanded}
                onToggle={toggle}
                pages={pages}
                onPage={(key) => updateView({ pages: capped([...pages, key]) })}
                showHidden={showHidden}
                showIgnored={showIgnored}
                git={git}
                onMenu={setMenu}
              />
            </ul>
          )}
        </Body>
      </ExplorerScroll>
      <EntryMenu
        target={menu}
        onClose={() => setMenu(null)}
        onSearch={(folder) => {
          setMenu(null);
          searchContents(folder);
        }}
        onDelete={(entry) => {
          setMenu(null);
          setDeleting(entry);
        }}
      />
      <DeleteDialog
        target={target}
        deleting={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={removed}
      />
    </section>
  );
}

/**
 * Shows `children`, or a searching note while the typed query settles. A new
 * `viewKey` remounts the view, so it never shows another query's results, and
 * Refresh reloads every expanded folder.
 */
function Body({
  searching,
  settled,
  viewKey,
  children,
}: {
  searching: boolean;
  settled: boolean;
  viewKey: string;
  children: ReactNode;
}) {
  if (searching && !settled) {
    return <Searching />;
  }
  return <div key={viewKey}>{children}</div>;
}
