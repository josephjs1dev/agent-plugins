import { useRef, useState } from "react";
import { z } from "zod";
import { relativeFilePath } from "essentials/file-explorer/browser";

/** The most expanded folders or loaded pages one view keeps. */
const MAX_ITEMS = 2000;

const viewSchema = z.object({
  scope: z.union([z.literal(""), relativeFilePath]),
  draft: z.string().max(200),
  selected: relativeFilePath.nullable(),
  expanded: z.array(relativeFilePath).max(MAX_ITEMS),
  /** The `pageKey` of each page whose **Load more** was pressed. */
  pages: z.array(z.string().max(9000)).max(MAX_ITEMS),
  scrollTop: z.number().finite().nonnegative(),
});
export type ExplorerView = z.infer<typeof viewSchema>;

const emptyView = (): ExplorerView => ({
  scope: "",
  draft: "",
  selected: null,
  expanded: [],
  pages: [],
  scrollTop: 0,
});

/** Views kept in memory when session storage is unavailable. */
const fallback = new Map<string, ExplorerView>();
const MAX_FALLBACK_VIEWS = 50;

const storageKey = (threadId: string) =>
  `essentials.file-explorer.v1:${threadId}`;

/** The key of one directory page, as stored in `ExplorerView.pages`. */
export const pageKey = (folder: string, after: unknown) =>
  JSON.stringify([folder, after]);

/** Keeps the newest `MAX_ITEMS` items of a stored list. */
export const capped = (items: readonly string[]) => items.slice(-MAX_ITEMS);

/** The saved view of `threadId`, or an empty view when none parses. */
export function readView(threadId: string): ExplorerView {
  try {
    const raw = sessionStorage.getItem(storageKey(threadId));
    if (!raw || raw.length > 1_000_000) {
      return emptyView();
    }
    return viewSchema.safeParse(JSON.parse(raw)).data ?? emptyView();
  } catch {
    return fallback.get(threadId) ?? emptyView();
  }
}

/** Saves to session storage, or to memory when storage refuses the write. */
export function writeView(threadId: string, view: ExplorerView): void {
  try {
    sessionStorage.setItem(storageKey(threadId), JSON.stringify(view));
  } catch {
    fallback.delete(threadId);
    fallback.set(threadId, view);
    const oldest = fallback.keys().next();
    if (fallback.size > MAX_FALLBACK_VIEWS && !oldest.done) {
      fallback.delete(oldest.value);
    }
  }
}

/**
 * The explorer's view of one thread: scope, search text, selection, expanded
 * folders, loaded pages, and scroll position. Opening a preview can unmount
 * the panel, so each update saves the view synchronously, and the next mount
 * restores it.
 */
export function useExplorerView(threadId: string) {
  const [view, setView] = useState(() => readView(threadId));
  const latest = useRef(view);
  const update = (patch: Partial<ExplorerView>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    writeView(threadId, next);
    setView(next);
  };
  return [view, update] as const;
}

const SHOW_HIDDEN_KEY = "essentials.file-explorer.show-hidden";
/** The preference while local storage is unavailable. */
let showHiddenFallback = true;

/** Whether the Explorer lists dotfiles. Defaults to true. */
export function readShowHidden(): boolean {
  try {
    const raw = localStorage.getItem(SHOW_HIDDEN_KEY);
    return raw === null ? showHiddenFallback : raw === "true";
  } catch {
    return showHiddenFallback;
  }
}

export function writeShowHidden(show: boolean): void {
  showHiddenFallback = show;
  try {
    localStorage.setItem(SHOW_HIDDEN_KEY, String(show));
  } catch {
    // The in-memory fallback keeps the preference for this session.
  }
}

/**
 * The Explorer's dotfile preference. It applies to every thread, and it
 * outlives a bb restart where local storage is available.
 */
export function useShowHidden() {
  const [show, setShow] = useState(readShowHidden);
  const update = (next: boolean) => {
    writeShowHidden(next);
    setShow(next);
  };
  return [show, update] as const;
}
