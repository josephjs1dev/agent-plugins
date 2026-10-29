import { useEffect, useMemo, useRef, useState } from "react";
import {
  useBbNavigate,
  type PluginNewThreadPanelProps,
  type PluginThreadPanelProps,
} from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import type { ExplorerTarget } from "../../shared/file-explorer";
import { useQuery, type Query, type Output } from "../data";
import { EntryMenu, type MenuTarget } from "../file-explorer/entry-menu";
import { previewTarget } from "../file-explorer/root";
import { ErrorNote, Glyph, Muted, iconButton } from "../file-explorer/ui";
import { ContentResults, type OpenMatch } from "./results";
import { useFocusRequest, useSearchView } from "./state";

/** The pause after typing before a search starts. */
const SEARCH_DELAY_MS = 250;

const field =
  "h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring";

/** The thread side-panel tab. */
export function ContentSearchPanel({ threadId }: PluginThreadPanelProps) {
  const target = useMemo(
    () => ({ kind: "thread" as const, threadId }),
    [threadId],
  );
  return <ContentSearch key={threadId} target={target} viewKey={threadId} />;
}

/** The New thread screen's tab: it searches the project's default checkout. */
export function NewThreadContentSearchPanel({
  projectId,
}: PluginNewThreadPanelProps) {
  const target = useMemo(
    () => (projectId ? { kind: "project" as const, projectId } : null),
    [projectId],
  );
  if (!target) {
    return (
      <div className="p-4">
        <Muted>Select a project to search its files.</Muted>
      </div>
    );
  }
  return (
    <ContentSearch
      key={projectId}
      target={target}
      viewKey={`project:${target.projectId}`}
    />
  );
}

/** `value`, once it has not changed for `SEARCH_DELAY_MS`. */
function useSettled<T>(value: T): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return settled;
}

function Toggle({
  label,
  title,
  pressed,
  onPress,
}: {
  label: string;
  title: string;
  pressed: boolean;
  onPress(this: void): void;
}) {
  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      aria-pressed={pressed}
      onClick={onPress}
      className={cn(
        iconButton,
        "size-6 font-mono text-[11px]",
        pressed && "bg-state-active text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function ContentSearch({
  target,
  viewKey,
}: {
  target: ExplorerTarget;
  viewKey: string;
}) {
  const navigate = useBbNavigate();
  // One panel: the server cancels its older searches, not another window's.
  const [sessionId] = useState(() => globalThis.crypto.randomUUID());
  const input = useRef<HTMLInputElement>(null);
  const [view, updateView] = useSearchView(viewKey);
  const [openError, setOpenError] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  useFocusRequest(viewKey, input);
  const typed = useMemo(
    () => ({
      query: view.query.trim(),
      include: view.include,
      exclude: view.exclude,
    }),
    [view.query, view.include, view.exclude],
  );
  const settled = useSettled(typed);
  const result = useQuery(
    "file_explorer.content",
    {
      target,
      sessionId,
      folder: view.folder,
      query: settled.query,
      include: settled.include,
      exclude: settled.exclude,
      caseSensitive: view.caseSensitive,
      wholeWord: view.wholeWord,
      regex: view.regex,
      showHidden: view.showHidden,
      showIgnored: view.showIgnored,
    },
    { enabled: settled.query.length > 0 },
  );
  const open: OpenMatch = (path, root, location) => {
    const opened = navigate.experimental_openFilePreview({
      target: previewTarget(root, path),
      location,
    });
    setOpenError(opened ? null : "bb could not open this preview.");
  };
  const toggleFile = (path: string) =>
    updateView({
      collapsed: view.collapsed.includes(path)
        ? view.collapsed.filter((item) => item !== path)
        : [...view.collapsed, path].slice(-200),
    });
  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-col text-foreground"
      aria-label="Search"
    >
      <header className="shrink-0 space-y-2 border-b border-border p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Search
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              aria-label="Show include and exclude filters"
              aria-pressed={view.filters}
              title="Include and exclude filters"
              className={cn(
                iconButton,
                view.filters && "bg-state-active text-foreground",
              )}
              onClick={() => updateView({ filters: !view.filters })}
            >
              <Glyph name="filter" className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Refresh search"
              title="Refresh search"
              className={iconButton}
              onClick={result.refetch}
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
            type="text"
            aria-label="Search file contents"
            placeholder="Search all files…"
            maxLength={200}
            className={cn(field, "pl-8 pr-20")}
            value={view.query}
            onChange={(event) =>
              updateView({ query: event.target.value, collapsed: [] })
            }
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                updateView({ query: "" });
              }
            }}
          />
          <div className="absolute right-0.5 top-1 flex">
            <Toggle
              label="Aa"
              title="Match case"
              pressed={view.caseSensitive}
              onPress={() => updateView({ caseSensitive: !view.caseSensitive })}
            />
            <Toggle
              label="ab"
              title="Match whole word"
              pressed={view.wholeWord}
              onPress={() => updateView({ wholeWord: !view.wholeWord })}
            />
            <Toggle
              label=".*"
              title="Use regular expression"
              pressed={view.regex}
              onPress={() => updateView({ regex: !view.regex })}
            />
          </div>
        </div>
        {view.filters ? (
          <div className="space-y-1.5">
            <input
              type="text"
              aria-label="Include files"
              placeholder="Include: e.g. src/**/*.ts, *.{md,txt}"
              maxLength={1000}
              className={field}
              value={view.include}
              onChange={(event) => updateView({ include: event.target.value })}
            />
            <input
              type="text"
              aria-label="Exclude files"
              placeholder="Exclude: e.g. vendor/*, *.lock"
              maxLength={1000}
              className={field}
              value={view.exclude}
              onChange={(event) => updateView({ exclude: event.target.value })}
            />
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              <label className="inline-flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={view.showHidden}
                  onChange={(event) =>
                    updateView({ showHidden: event.target.checked })
                  }
                />
                Search hidden files
              </label>
              <label className="inline-flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={view.showIgnored}
                  onChange={(event) =>
                    updateView({ showIgnored: event.target.checked })
                  }
                />
                Search ignored files
              </label>
            </div>
          </div>
        ) : null}
        {view.folder ? (
          <div className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
            <Glyph name="folder" className="size-3" />
            <span className="truncate" title={view.folder}>
              In {view.folder}
            </span>
            <button
              type="button"
              aria-label="Search all files"
              title="Search all files"
              className={cn(iconButton, "size-5")}
              onClick={() => updateView({ folder: "", collapsed: [] })}
            >
              <Glyph name="close" className="size-3" />
            </button>
          </div>
        ) : null}
      </header>
      <div
        aria-label="Search results"
        className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
      >
        {openError ? (
          <div className="mb-2 px-2">
            <ErrorNote>{openError}</ErrorNote>
          </div>
        ) : null}
        <Body
          query={view.query.trim()}
          settled={settled === typed}
          result={result}
          collapsed={view.collapsed}
          onToggle={toggleFile}
          onOpen={open}
          onMenu={setMenu}
        />
      </div>
      <EntryMenu target={menu} onClose={() => setMenu(null)} />
    </section>
  );
}

/** A prompt, a searching note, an error, or the results. */
function Body({
  query,
  settled,
  result,
  ...props
}: {
  query: string;
  settled: boolean;
  result: Query<Output<"file_explorer.content">>;
} & Omit<Parameters<typeof ContentResults>[0], "data">) {
  if (!query) {
    return (
      <div className="p-3">
        <Muted>Type to search file contents.</Muted>
      </div>
    );
  }
  if (result.error && settled && !result.loading) {
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
  if (!settled || result.loading || !result.data) {
    return (
      <div role="status" className="p-3 text-xs text-muted-foreground">
        Searching file contents…
      </div>
    );
  }
  return <ContentResults data={result.data} {...props} />;
}
