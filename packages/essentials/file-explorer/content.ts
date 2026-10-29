import { z } from "zod";
import {
  SEARCH_EXCLUDED_DIRECTORIES,
  folderSchema,
  relativeFilePath,
} from "./browser";

/** The most files, and matches in all files, that one content search returns. */
export const MAX_CONTENT_FILES = 200;
export const MAX_CONTENT_MATCHES = 1_000;
/** ripgrep stops reading a file after this many matching lines. */
export const MAX_MATCHES_PER_FILE = 50;
/** The longest line preview, in UTF-16 code units. */
export const MAX_PREVIEW_CHARS = 300;
const MAX_RANGES = 20;
const MAX_GLOBS = 20;

/**
 * Splits comma-separated globs. A comma inside `{a,b}` alternation stays in
 * its glob, so `*.{ts,tsx}` is one pattern.
 */
export function splitGlobs(value: string): string[] {
  const globs: string[] = [];
  let depth = 0;
  let current = "";

  for (const character of value) {
    if (character === "{") {
      depth++;
    } else if (character === "}") {
      depth = Math.max(0, depth - 1);
    }

    if (character === "," && depth === 0) {
      globs.push(current);
      current = "";
    } else {
      current += character;
    }
  }

  globs.push(current);

  return globs.map((glob) => glob.trim()).filter(Boolean);
}

const globList = z
  .string()
  .max(1000)
  .refine(
    (value) => splitGlobs(value).length <= MAX_GLOBS,
    `Use at most ${MAX_GLOBS} patterns`,
  );

export const contentSearchRequestSchema = z
  .object({
    folder: folderSchema,
    query: z.string().min(1).max(200),
    caseSensitive: z.boolean(),
    wholeWord: z.boolean(),
    /** Reads `query` as a ripgrep regular expression, not literal text. */
    regex: z.boolean(),
    /** Comma-separated globs a file must match. Empty searches every file. */
    include: globList,
    /** Comma-separated globs that skip a file or folder. */
    exclude: globList,
    showHidden: z.boolean(),
    /** Searches files that `.gitignore` and other ignore files skip. */
    showIgnored: z.boolean(),
  })
  .strict();
export type ContentSearchRequest = z.infer<typeof contentSearchRequestSchema>;

const rangeSchema = z.object({
  start: z.int().nonnegative(),
  end: z.int().nonnegative(),
});

export const contentMatchSchema = z.object({
  line: z.int().positive(),
  /** The one-based column of the first match, for bb's preview location. */
  column: z.int().positive(),
  text: z.string().max(MAX_PREVIEW_CHARS),
  /** The string index ranges in `text` to highlight. */
  ranges: z.array(rangeSchema).max(MAX_RANGES),
});
export type ContentMatch = z.infer<typeof contentMatchSchema>;

export const contentFileSchema = z.object({
  path: relativeFilePath,
  matches: z.array(contentMatchSchema).max(MAX_MATCHES_PER_FILE),
});
export type ContentFile = z.infer<typeof contentFileSchema>;

export const contentSearchResultSchema = z.object({
  /** Files by path in code-unit order. */
  files: z.array(contentFileSchema).max(MAX_CONTENT_FILES),
  matches: z.int().nonnegative(),
  /** The file or match limit stopped the search. */
  truncated: z.boolean(),
  /**
   * The deadline, an oversized output line, or an unreadable file left the
   * scan incomplete.
   */
  limited: z.boolean(),
});
export type ContentSearchResult = z.infer<typeof contentSearchResultSchema>;

/**
 * The ripgrep arguments of `request`. The query and globs are separate
 * arguments, never shell text. The `SEARCH_EXCLUDED_DIRECTORIES` globs come
 * first and prune their folders, so an Include pattern cannot re-include one.
 */
export function ripgrepArgs(request: ContentSearchRequest): string[] {
  const args = [
    "--json",
    "--no-config",
    "--max-count",
    String(MAX_MATCHES_PER_FILE),
    "--max-filesize",
    "1M",
    request.caseSensitive ? "--case-sensitive" : "--ignore-case",
  ];

  if (!request.regex) {
    args.push("--fixed-strings");
  }

  if (request.wholeWord) {
    args.push("--word-regexp");
  }

  if (request.showHidden) {
    args.push("--hidden");
  }

  if (request.showIgnored) {
    args.push("--no-ignore");
  }

  for (const directory of SEARCH_EXCLUDED_DIRECTORIES) {
    args.push("--glob", "!" + directory);
  }

  for (const glob of splitGlobs(request.include)) {
    args.push("--glob", glob);
  }

  for (const glob of splitGlobs(request.exclude)) {
    args.push("--glob", "!" + glob);
  }

  args.push("--regexp", request.query, "--");

  if (request.folder) {
    args.push(request.folder);
  }

  return args;
}

function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) {
    return 1;
  }

  if (codePoint < 0x800) {
    return 2;
  }

  return codePoint < 0x10000 ? 3 : 4;
}

/** Maps a UTF-8 byte offset, as ripgrep reports it, to a string index. */
export function stringIndex(text: string, byteOffset: number): number {
  let bytes = 0;
  let index = 0;

  for (const character of text) {
    if (bytes >= byteOffset) {
      break;
    }

    bytes += utf8Length(character.codePointAt(0) ?? 0);
    index += character.length;
  }

  return index;
}

// A path or line that is not UTF-8 arrives as `bytes`, not `text`, and fails
// this schema, so the collector skips it.
const ripgrepMatchSchema = z.object({
  type: z.literal("match"),
  data: z.object({
    path: z.object({ text: z.string() }),
    lines: z.object({ text: z.string() }),
    line_number: z.int().positive(),
    submatches: z.array(rangeSchema),
  }),
});
type RipgrepMatch = z.infer<typeof ripgrepMatchSchema>["data"];

function previewMatch({
  lines,
  line_number,
  submatches,
}: RipgrepMatch): ContentMatch {
  const line = lines.text.replace(/\r?\n$/, "");
  const ranges = submatches.slice(0, MAX_RANGES).map(({ start, end }) => ({
    start: stringIndex(line, start),
    end: stringIndex(line, end),
  }));
  const first = ranges[0]?.start ?? 0;
  // A long line's preview starts shortly before its first match.
  const offset = first > MAX_PREVIEW_CHARS - 60 ? first - 40 : 0;
  const text = line.slice(offset, offset + MAX_PREVIEW_CHARS);

  return {
    line: line_number,
    column: first + 1,
    text,
    ranges: ranges
      .map(({ start, end }) => ({
        start: start - offset,
        end: Math.min(end - offset, text.length),
      }))
      .filter(({ start, end }) => start >= 0 && start < end),
  };
}

/** Collects ripgrep `--json` lines until a limit stops the search. */
export function createContentCollector() {
  const files = new Map<string, ContentFile>();
  let matches = 0;
  let truncated = false;

  return {
    /** Adds one output line. Returns false once a limit stops the search. */
    add(raw: string): boolean {
      if (truncated) {
        return false;
      }

      let event: unknown;

      try {
        event = JSON.parse(raw);
      } catch {
        return true;
      }

      const parsed = ripgrepMatchSchema.safeParse(event);

      if (!parsed.success) {
        return true;
      }

      const path = relativeFilePath.safeParse(
        parsed.data.data.path.text.replace(/^\.\//, ""),
      );

      if (!path.success) {
        return true;
      }

      let file = files.get(path.data);

      if (
        (!file && files.size >= MAX_CONTENT_FILES) ||
        matches >= MAX_CONTENT_MATCHES
      ) {
        truncated = true;

        return false;
      }

      if (!file) {
        file = { path: path.data, matches: [] };
        files.set(path.data, file);
      }

      file.matches.push(previewMatch(parsed.data.data));
      matches++;

      return true;
    },
    finish(limited: boolean): ContentSearchResult {
      const sorted = [...files.values()].sort((a, b) => {
        if (a.path < b.path) {
          return -1;
        }

        return a.path > b.path ? 1 : 0;
      });

      return { files: sorted, matches, truncated, limited };
    },
  };
}
