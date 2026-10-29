import { useEffect, type RefObject } from "react";
import { z } from "zod";
import { relativeFilePath } from "essentials/file-explorer/browser";
import { MAX_CONTENT_FILES } from "essentials/file-explorer/content";
import {
  patchStoredView,
  useStoredView,
  type ViewStore,
} from "../file-explorer/view-state";

const searchViewSchema = z.object({
  folder: z.union([z.literal(""), relativeFilePath]),
  query: z.string().max(200),
  caseSensitive: z.boolean(),
  wholeWord: z.boolean(),
  regex: z.boolean(),
  include: z.string().max(1000),
  exclude: z.string().max(1000),
  /** The Include and Exclude fields are open. */
  filters: z.boolean(),
  showHidden: z.boolean(),
  showIgnored: z.boolean(),
  /** Result files whose matches are folded. */
  collapsed: z.array(relativeFilePath).max(MAX_CONTENT_FILES),
});
export type SearchView = z.infer<typeof searchViewSchema>;

const SEARCH: ViewStore<SearchView> = {
  prefix: "essentials.content-search.v1:",
  schema: searchViewSchema,
  empty: () => ({
    folder: "",
    query: "",
    caseSensitive: false,
    wholeWord: false,
    regex: false,
    include: "",
    exclude: "",
    filters: false,
    showHidden: true,
    showIgnored: false,
    collapsed: [],
  }),
};

/** View keys whose Search panel focuses its query when it mounts. */
const focusRequests = new Set<string>();
/** The query focus of each mounted Search panel. */
const focusers = new Map<string, () => void>();

/**
 * The Search view of one thread or project, keyed like the Explorer's view.
 * It holds the query, the options, the folder, and folded files.
 */
export const useSearchView = (key: string) => useStoredView(SEARCH, key);

/** Focuses `input` on a request for `key`, now or when the panel mounts. */
export function useFocusRequest(
  key: string,
  input: RefObject<HTMLInputElement | null>,
): void {
  useEffect(() => {
    const focus = () => input.current?.focus();
    if (focusRequests.delete(key)) {
      focus();
    }
    focusers.set(key, focus);
    return () => {
      if (focusers.get(key) === focus) {
        focusers.delete(key);
      }
    };
  }, [key, input]);
}

/**
 * Asks the Search panel of `key` to focus its query, and to search `folder`
 * when it is set. Call it before the panel opens without params, so bb
 * reuses the one Search tab instead of opening another.
 */
export function requestContentSearch(key: string, folder?: string): void {
  if (folder !== undefined) {
    patchStoredView(SEARCH, key, { folder, collapsed: [] });
  }
  const focus = focusers.get(key);
  if (focus) {
    // bb shows the tab after this call returns.
    setTimeout(focus, 0);
  } else {
    focusRequests.add(key);
  }
}
