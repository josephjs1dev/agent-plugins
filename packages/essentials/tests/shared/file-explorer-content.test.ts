import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_CONTENT_FILES,
  MAX_CONTENT_MATCHES,
  MAX_PREVIEW_CHARS,
  contentSearchRequestSchema,
  createContentCollector,
  ripgrepArgs,
  splitGlobs,
  stringIndex,
  type ContentSearchRequest,
} from "../../file-explorer/content";

const request: ContentSearchRequest = {
  folder: "",
  query: "needle",
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  include: "",
  exclude: "",
  showHidden: true,
  showIgnored: false,
};

const match = (path: string, line: number, text: string, start: number) =>
  JSON.stringify({
    type: "match",
    data: {
      path: { text: path },
      lines: { text: text + "\n" },
      line_number: line,
      submatches: [{ match: { text: "x" }, start, end: start + 6 }],
    },
  });

test("globs split at top-level commas only", () => {
  assert.deepEqual(splitGlobs(" src/**/*.ts, *.{ts,tsx} ,,docs "), [
    "src/**/*.ts",
    "*.{ts,tsx}",
    "docs",
  ]);
  assert.deepEqual(splitGlobs(""), []);
  assert.equal(
    contentSearchRequestSchema.safeParse({
      ...request,
      include: Array.from({ length: 21 }, (_, index) => `${index}`).join(","),
    }).success,
    false,
  );
});

test("the request maps to separate ripgrep arguments", () => {
  const args = ripgrepArgs({
    ...request,
    query: "--files",
    folder: "src",
    caseSensitive: true,
    wholeWord: true,
    regex: true,
    include: "*.ts",
    exclude: "vendor/*",
    showHidden: false,
    showIgnored: true,
  });
  assert.ok(args.includes("--case-sensitive"));
  assert.ok(args.includes("--word-regexp"));
  assert.ok(args.includes("--no-ignore"));
  assert.ok(!args.includes("--fixed-strings"));
  assert.ok(!args.includes("--hidden"));
  assert.deepEqual(args.slice(-4), ["--regexp", "--files", "--", "src"]);
  const globs = args.flatMap((arg, index) =>
    args[index - 1] === "--glob" ? [arg] : [],
  );
  assert.equal(globs[0], "!.git");
  assert.deepEqual(globs.slice(-2), ["*.ts", "!vendor/*"]);
  const literal = ripgrepArgs(request);
  assert.ok(literal.includes("--fixed-strings"));
  assert.ok(literal.includes("--ignore-case"));
  assert.ok(literal.includes("--hidden"));
  assert.equal(literal.at(-1), "--");
});

test("ripgrep byte offsets map to string indexes", () => {
  assert.equal(stringIndex("abc", 2), 2);
  assert.equal(stringIndex("é needle", 3), 2);
  assert.equal(stringIndex("😀needle", 4), 2);
  assert.equal(stringIndex("abc", 10), 3);
});

test("the collector groups matches by file, sorted, and skips bad lines", () => {
  const collector = createContentCollector();
  assert.equal(collector.add(match("./b.ts", 3, "a needle", 2)), true);
  assert.equal(collector.add(match("a.ts", 1, "needle", 0)), true);
  assert.equal(collector.add(match("a.ts", 9, "needle again", 0)), true);
  assert.equal(collector.add("{"), true);
  assert.equal(collector.add(JSON.stringify({ type: "begin" })), true);
  assert.equal(collector.add(match("../escape", 1, "needle", 0)), true);
  assert.equal(
    collector.add(
      JSON.stringify({
        type: "match",
        data: {
          path: { bytes: "AA==" },
          lines: { text: "needle" },
          line_number: 1,
          submatches: [],
        },
      }),
    ),
    true,
  );
  const result = collector.finish(false);
  assert.deepEqual(
    result.files.map((file) => [file.path, file.matches.length]),
    [
      ["a.ts", 2],
      ["b.ts", 1],
    ],
  );
  assert.deepEqual(result.files[1]?.matches[0], {
    line: 3,
    column: 3,
    text: "a needle",
    ranges: [{ start: 2, end: 8 }],
  });
  assert.equal(result.matches, 3);
  assert.equal(result.truncated, false);
});

test("a long line's preview keeps its first match", () => {
  const collector = createContentCollector();
  const text = "x".repeat(1000) + "needle" + "y".repeat(1000);
  collector.add(match("a.ts", 1, text, 1000));
  const [preview] = collector.finish(false).files[0]?.matches ?? [];
  assert.equal(preview?.text.length, MAX_PREVIEW_CHARS);
  assert.equal(preview?.column, 1001);
  const range = preview?.ranges[0];
  assert.ok(range);
  assert.equal(preview?.text.slice(range.start, range.end), "needle");
});

test("the file and match limits stop the collector", () => {
  const files = createContentCollector();

  for (let index = 0; index < MAX_CONTENT_FILES; index++) {
    assert.equal(files.add(match(`f${index}.ts`, 1, "needle", 0)), true);
  }

  assert.equal(files.add(match("extra.ts", 1, "needle", 0)), false);
  assert.equal(files.finish(false).truncated, true);
  const matches = createContentCollector();

  for (let index = 0; index < MAX_CONTENT_MATCHES; index++) {
    matches.add(match(`f${index % 20}.ts`, index + 1, "needle", 0));
  }

  assert.equal(matches.add(match("f0.ts", 5000, "needle", 0)), false);
  const result = matches.finish(false);
  assert.equal(result.matches, MAX_CONTENT_MATCHES);
  assert.equal(result.truncated, true);
});
