import { useEffect, useRef, useState } from "react";
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

/** One kind of stored panel view: its storage prefix, schema, and default. */
export interface ViewStore<T extends object> {
  prefix: string;
  schema: z.ZodType<T>;
  empty(this: void): T;
}

const EXPLORER: ViewStore<ExplorerView> = {
  prefix: "essentials.file-explorer.v1:",
  schema: viewSchema,
  empty: emptyView,
};

/** Views kept in memory when session storage is unavailable. */
const fallback = new Map<string, unknown>();
const MAX_FALLBACK_VIEWS = 50;

/** The mounted views of each storage key, so a patch reaches them at once. */
const listeners = new Map<string, Set<(patch: object) => void>>();

/** The key of one directory page, as stored in `ExplorerView.pages`. */
export const pageKey = (folder: string, after: unknown) =>
  JSON.stringify([folder, after]);

/** Keeps the newest `MAX_ITEMS` items of a stored list. */
export const capped = (items: readonly string[]) => items.slice(-MAX_ITEMS);

function readStored<T extends object>(store: ViewStore<T>, key: string): T {
  const storageKey = store.prefix + key;
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw || raw.length > 1_000_000) {
      return store.empty();
    }
    return store.schema.safeParse(JSON.parse(raw)).data ?? store.empty();
  } catch {
    // Only `writeStored` fills the fallback, with a parsed view of this store.
    return (fallback.get(storageKey) as T | undefined) ?? store.empty();
  }
}

/** Saves to session storage, or to memory when storage refuses the write. */
function writeStored(storageKey: string, view: object): void {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(view));
  } catch {
    fallback.delete(storageKey);
    fallback.set(storageKey, view);
    const oldest = fallback.keys().next();
    if (fallback.size > MAX_FALLBACK_VIEWS && !oldest.done) {
      fallback.delete(oldest.value);
    }
  }
}

/**
 * The stored view of one panel. Opening a preview can unmount the panel, so
 * each update saves the view synchronously, and the next mount restores it.
 */
export function useStoredView<T extends object>(
  store: ViewStore<T>,
  key: string,
) {
  const storageKey = store.prefix + key;
  const [view, setView] = useState(() => readStored(store, key));
  const latest = useRef(view);
  const update = (patch: Partial<T>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    writeStored(storageKey, next);
    setView(next);
  };
  const updateRef = useRef(update);
  updateRef.current = update;
  useEffect(() => {
    const listener = (patch: object) => updateRef.current(patch as Partial<T>);
    const mounted = listeners.get(storageKey) ?? new Set();
    mounted.add(listener);
    listeners.set(storageKey, mounted);
    return () => {
      mounted.delete(listener);
      if (mounted.size === 0) {
        listeners.delete(storageKey);
      }
    };
  }, [storageKey]);
  return [view, update] as const;
}

/**
 * Patches the stored view of `key` from another panel. A mounted view
 * applies the patch at once; otherwise the next mount reads it.
 */
export function patchStoredView<T extends object>(
  store: ViewStore<T>,
  key: string,
  patch: Partial<T>,
): void {
  const storageKey = store.prefix + key;
  const mounted = listeners.get(storageKey);
  if (mounted?.size) {
    for (const listener of mounted) {
      listener(patch);
    }
    return;
  }
  writeStored(storageKey, { ...readStored(store, key), ...patch });
}

/** The saved Explorer view of `key`, or an empty view when none parses. */
export const readView = (key: string) => readStored(EXPLORER, key);

export const writeView = (key: string, view: ExplorerView) =>
  writeStored(EXPLORER.prefix + key, view);

/**
 * The Explorer's view of one thread or project: scope, search text,
 * selection, expanded folders, loaded pages, and scroll position. `key` is
 * the thread ID, or `project:<projectId>` on the New thread screen.
 */
export const useExplorerView = (key: string) => useStoredView(EXPLORER, key);

/** A true-by-default preference in local storage, kept in memory as well. */
function preference(storageKey: string) {
  let memory = true;
  return {
    read(): boolean {
      try {
        const raw = localStorage.getItem(storageKey);
        return raw === null ? memory : raw === "true";
      } catch {
        return memory;
      }
    },
    write(value: boolean): void {
      memory = value;
      try {
        localStorage.setItem(storageKey, String(value));
      } catch {
        // The in-memory value keeps the preference for this session.
      }
    },
  };
}

const showHidden = preference("essentials.file-explorer.show-hidden");
const showIgnored = preference("essentials.file-explorer.show-ignored");

/** Whether the Explorer lists dotfiles. Defaults to true. */
export const readShowHidden = showHidden.read;
export const writeShowHidden = showHidden.write;
/** Whether the Explorer lists files that Git ignores. Defaults to true. */
export const readShowIgnored = showIgnored.read;
export const writeShowIgnored = showIgnored.write;

function usePreference(stored: ReturnType<typeof preference>) {
  const [value, setValue] = useState(stored.read);
  const update = (next: boolean) => {
    stored.write(next);
    setValue(next);
  };
  return [value, update] as const;
}

/**
 * The Explorer's dotfile preference. It applies to every thread and project,
 * and it outlives a bb restart where local storage is available.
 */
export const useShowHidden = () => usePreference(showHidden);

/** The Explorer's ignored-file preference, stored like the dotfile one. */
export const useShowIgnored = () => usePreference(showIgnored);
