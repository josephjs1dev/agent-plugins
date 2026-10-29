import type { ReactNode } from "react";
import type { ExperimentalFileLocation } from "@get-bb/plugin-sdk/app";
import { parentFolder } from "essentials/file-explorer/browser";
import {
  MAX_MATCHES_PER_FILE,
  type ContentFile,
  type ContentMatch,
} from "essentials/file-explorer/content";
import { cn } from "@/lib/utils";
import type { ExplorerRoot } from "../../shared/file-explorer";
import type { Output } from "../data";
import {
  menuAtPointer,
  menuFromKey,
  type OpenMenu,
} from "../file-explorer/entry-menu";
import { Glyph, Muted, fileTone, hoverHighlight } from "../file-explorer/ui";

export type OpenMatch = (
  this: void,
  path: string,
  root: ExplorerRoot,
  location: ExperimentalFileLocation,
) => void;

/** `text` with each range in `ranges` marked. Overlapping ranges are skipped. */
function Highlighted({
  text,
  ranges,
}: {
  text: string;
  ranges: ContentMatch["ranges"];
}) {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const { start, end } of ranges) {
    if (start < at) {
      continue;
    }
    parts.push(
      text.slice(at, start),
      <mark key={start} className="rounded-sm bg-amber-500/30 text-foreground">
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

/** Content matches grouped by file. A file row folds its matches. */
export function ContentResults({
  data,
  collapsed,
  onToggle,
  onOpen,
  onMenu,
}: {
  data: Output<"file_explorer.content">;
  collapsed: readonly string[];
  onToggle(this: void, path: string): void;
  onOpen: OpenMatch;
  onMenu: OpenMenu;
}) {
  const root = data.root;
  if (!root) {
    return (
      <div className="p-3">
        <Muted>There is no workspace to search.</Muted>
      </div>
    );
  }
  const files = data.files.length;
  return (
    <>
      <p role="status" className="px-2 pb-2 text-[11px] text-muted-foreground">
        {data.matches} {data.matches === 1 ? "match" : "matches"} in {files}{" "}
        {files === 1 ? "file" : "files"}
        {data.truncated ? " · showing the first results" : ""}
      </p>
      {data.limited ? (
        <div className="px-2 pb-2">
          <Muted>
            The search stopped early. Choose a narrower folder or add an Include
            pattern.
          </Muted>
        </div>
      ) : null}
      {files === 0 ? (
        <div className="px-2 py-5 text-center">
          <Glyph
            name="search"
            className="mx-auto mb-2 size-6 text-muted-foreground/50"
          />
          <p className="text-sm">No matching lines</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Check the search options and the Include and Exclude patterns.
          </p>
        </div>
      ) : null}
      <ul aria-label="Content results" className="space-y-1">
        {data.files.map((file) => (
          <FileMatches
            key={file.path}
            file={file}
            root={root}
            expanded={!collapsed.includes(file.path)}
            onToggle={onToggle}
            onOpen={onOpen}
            onMenu={onMenu}
          />
        ))}
      </ul>
    </>
  );
}

function FileMatches({
  file,
  root,
  expanded,
  onToggle,
  onOpen,
  onMenu,
}: {
  file: ContentFile;
  root: ExplorerRoot;
  expanded: boolean;
  onToggle(this: void, path: string): void;
  onOpen: OpenMatch;
  onMenu: OpenMenu;
}) {
  const entry = { path: file.path, kind: "file" } as const;
  const count = file.matches.length;
  const more = count === MAX_MATCHES_PER_FILE;
  return (
    <li>
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={file.path}
        title={file.path}
        onClick={() => onToggle(file.path)}
        onContextMenu={menuAtPointer(entry, root.key, onMenu)}
        onKeyDown={(event) => {
          menuFromKey(event, entry, root.key, onMenu);
        }}
        className={cn(
          "flex w-full min-w-0 items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs",
          hoverHighlight,
        )}
      >
        <Glyph
          name="chevron"
          className={cn(
            "size-3 text-muted-foreground transition-transform",
            expanded && "rotate-90",
          )}
        />
        <Glyph name="file" className={fileTone(file.path)} />
        <span className="truncate font-medium">
          {file.path.split("/").at(-1)}
        </span>
        <span className="min-w-0 truncate text-[11px] text-muted-foreground">
          {parentFolder(file.path)}
        </span>
        <span
          className="ml-auto shrink-0 text-[10px] text-muted-foreground"
          title={more ? "This file has more matches" : undefined}
        >
          {count}
          {more ? "+" : ""}
        </span>
      </button>
      {expanded ? (
        <ul aria-label={`Matches in ${file.path}`}>
          {file.matches.map((match) => (
            <li key={match.line}>
              <button
                type="button"
                aria-label={`${file.path} line ${match.line}`}
                onClick={() =>
                  onOpen(file.path, root, {
                    kind: "line",
                    line: match.line,
                    column: match.column,
                  })
                }
                className={cn(
                  "flex w-full min-w-0 items-baseline gap-2 rounded py-0.5 pl-7 pr-2 text-left font-mono text-[11px]",
                  hoverHighlight,
                )}
              >
                <span className="w-8 shrink-0 text-right text-muted-foreground">
                  {match.line}
                </span>
                <span className="truncate whitespace-pre">
                  <Highlighted text={match.text} ranges={match.ranges} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
