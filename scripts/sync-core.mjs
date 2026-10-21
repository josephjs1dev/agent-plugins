#!/usr/bin/env node
// Generate a host adapter's copy of packages/<plugin>.
//
// Hosts install a plugin directory on its own, so each adapter commits a copy
// of its core. The core keeps one `src/` tree; the host layout decides where
// each module lands in the adapter:
//
// - A `src/` module goes to the host's shared directory when every module it
//   reaches, type imports included, is relative core code or an allowed
//   package. Otherwise it goes to the host's server directory.
// - `tests/` keeps its paths.
//
// Relative imports are rewritten for the new locations, and the adapter's
// Prettier formats the result. `.core-files` lists the generated paths; edit
// the core, never the copies.
//
// Usage: node scripts/sync-core.mjs <plugin> <host> [--check]
import { existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { dirname, extname, join, posix, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const hosts = {
  // Paseo compiles client/, server/ and shared/. Shared modules may import only
  // shared code: no Node, React, or runtime-specific SDK entries.
  paseo: { shared: "shared", server: "server/core", sharedPackages: ["zod"] },
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [plugin, host, flag] = process.argv.slice(2);
if (!plugin || !host || (flag && flag !== "--check")) {
  console.error("Usage: node scripts/sync-core.mjs <plugin> <host> [--check]");
  process.exit(2);
}
const layout = hosts[host];
if (!layout) {
  console.error(
    `No adapter layout for host "${host}" in scripts/sync-core.mjs.`,
  );
  process.exit(2);
}
const core = join(root, "packages", plugin);
const target = join(root, host, plugin);
const manifest = join(target, ".core-files");
const ignored = new Set(["node_modules", "test-results", ".DS_Store"]);
const codeExtensions = new Set([".ts", ".tsx", ".mts"]);
// from "x", import "x", import("x"), and import.meta.resolve("x").
const specifierPattern =
  /(?<![.\w$])(from\s*|import\s*\(\s*|import\s+|import\.meta\.resolve\(\s*)(["'])([^"'\n]+)\2/g;

async function walk(directory) {
  if (!existsSync(directory)) {
    return [];
  }
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(path)));
    } else if (entry.isFile()) {
      files.push(relative(core, path).split(sep).join("/"));
    }
  }
  return files;
}

const files = [
  ...(await walk(join(core, "src"))),
  ...(await walk(join(core, "tests"))),
].sort();
const known = new Set(files);
const sources = new Map();
for (const file of files) {
  if (codeExtensions.has(extname(file))) {
    sources.set(file, await readFile(join(core, file), "utf8"));
  }
}

function resolveRelative(importer, specifier) {
  const base = posix.normalize(posix.join(posix.dirname(importer), specifier));
  return (
    [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((path) =>
      known.has(path),
    ) ?? null
  );
}

function imports(file) {
  return [...sources.get(file).matchAll(specifierPattern)].map(
    (match) => match[3],
  );
}

// A module is shared when everything it reaches is shared-safe.
const sharedSafe = new Map();
function isShared(file, visiting = new Set()) {
  if (sharedSafe.has(file)) {
    return sharedSafe.get(file);
  }
  if (visiting.has(file)) {
    return true;
  }
  visiting.add(file);
  let safe = true;
  for (const specifier of imports(file)) {
    if (specifier.startsWith(".")) {
      const dependency = resolveRelative(file, specifier);
      if (!dependency || !dependency.startsWith("src/")) {
        safe = false;
      } else if (sources.has(dependency) && !isShared(dependency, visiting)) {
        safe = false;
      }
    } else if (!layout.sharedPackages.includes(specifier)) {
      safe = false;
    }
  }
  visiting.delete(file);
  sharedSafe.set(file, safe);
  return safe;
}

function placement(file) {
  if (!file.startsWith("src/")) {
    return file;
  }
  const rest = file.slice("src/".length);
  return sources.has(file) && !isShared(file)
    ? `${layout.server}/${rest}`
    : `${layout.shared}/${rest}`;
}

const prettierEntry = join(target, "node_modules", "prettier", "index.mjs");
if (!existsSync(prettierEntry)) {
  console.error(`Install ${host}/${plugin} dependencies first: npm ci`);
  process.exit(2);
}
const prettier = await import(pathToFileURL(prettierEntry).href);

async function generate(file) {
  const destination = placement(file);
  if (!sources.has(file)) {
    return { destination, content: await readFile(join(core, file)) };
  }
  const source = sources
    .get(file)
    .replace(specifierPattern, (match, prefix, quote, specifier) => {
      if (!specifier.startsWith(".")) {
        return match;
      }
      const dependency = resolveRelative(file, specifier);
      if (!dependency) {
        return match;
      }
      let path = posix.relative(
        posix.dirname(destination),
        placement(dependency),
      );
      if (!codeExtensions.has(extname(specifier))) {
        path = path.slice(0, -extname(path).length);
        if (path.endsWith("/index") && !specifier.endsWith("index")) {
          path = path.slice(0, -"/index".length);
        }
      }
      return `${prefix}${quote}${path.startsWith(".") ? path : `./${path}`}${quote}`;
    });
  const options = await prettier.resolveConfig(join(target, destination));
  const content = await prettier.format(source, {
    ...options,
    filepath: join(target, destination),
  });
  return { destination, content };
}

const generated = new Map();
for (const file of files) {
  const { destination, content } = await generate(file);
  generated.set(destination, Buffer.from(content));
}
const listed = [...generated.keys()].sort();
const previous = existsSync(manifest)
  ? (await readFile(manifest, "utf8")).split("\n").filter(Boolean)
  : [];
const stale = previous.filter((file) => !generated.has(file));
const changed = [];
for (const [file, content] of generated) {
  const path = join(target, file);
  if (!existsSync(path) || !(await readFile(path)).equals(content)) {
    changed.push(file);
  }
}
const listing = `${listed.join("\n")}\n`;
const listingChanged =
  !existsSync(manifest) || (await readFile(manifest, "utf8")) !== listing;

if (flag === "--check") {
  const drift = [
    ...changed,
    ...stale.filter((file) => existsSync(join(target, file))),
  ];
  if (drift.length || listingChanged) {
    console.error(
      `${host}/${plugin} is out of sync with packages/${plugin}:\n` +
        drift.map((file) => `  ${file}`).join("\n") +
        `\nRun: node scripts/sync-core.mjs ${plugin} ${host}`,
    );
    process.exit(1);
  }
  process.exit(0);
}
for (const file of changed) {
  await mkdir(dirname(join(target, file)), { recursive: true });
  await writeFile(join(target, file), generated.get(file));
}
for (const file of stale) {
  await rm(join(target, file), { force: true });
  // Remove directories the stale file leaves empty.
  for (
    let directory = dirname(join(target, file));
    directory.startsWith(target) && directory !== target;
    directory = dirname(directory)
  ) {
    const entries = existsSync(directory) ? await readdir(directory) : [""];
    const visible = entries.filter((name) => name !== ".DS_Store");
    if (visible.length > 0) {
      break;
    }
    await rm(join(directory, ".DS_Store"), { force: true });
    await rmdir(directory);
  }
}
await writeFile(manifest, listing);
const server = listed.filter((file) => file.startsWith(`${layout.server}/`));
console.log(
  `Synced ${listed.length} core files into ${host}/${plugin} (${server.length} under ${layout.server}/, ${changed.length} changed, ${stale.length} removed).`,
);
