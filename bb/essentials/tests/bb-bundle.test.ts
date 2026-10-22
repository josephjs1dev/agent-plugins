import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { test } from "node:test";

// bb bundles app.tsx for the browser. The app bundle must reach no server/
// module and no Node builtin, including through the linked essentials core.
// Type-only imports are erased by the bundler, so they do not count.
const root = resolve(import.meta.dirname, "..");
const corePackage = "essentials";
const coreRoot = resolve(root, "../../packages", corePackage);
const builtins = new Set(builtinModules);
const specifiers =
  /^(?!\s*(?:import|export)\s+type\s)[^\n]*?(?<![.\w$])(?:from|import)\s*\(?\s*["']([^"'\n]+)["']/gm;

function path(file: string) {
  const base = file.startsWith(coreRoot) ? dirname(coreRoot) : root;
  return relative(base, file).split(sep).join("/");
}

function existing(base: string): string | null {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
  ];
  return (
    candidates.find((file) => existsSync(file) && statSync(file).isFile()) ??
    null
  );
}

function resolveModule(importer: string, specifier: string): string | null {
  if (specifier.startsWith(".")) {
    return existing(resolve(dirname(importer), specifier));
  }
  if (specifier.startsWith("@/")) {
    return existing(join(root, specifier.slice(2)));
  }
  if (specifier.startsWith(`${corePackage}/`)) {
    return existing(join(coreRoot, specifier.slice(corePackage.length + 1)));
  }
  return null;
}

function imports(file: string) {
  // Multi-line import lists end on the line holding `from "..."`.
  const source = readFileSync(file, "utf8").replace(
    /^\s*(?:import|export)\s+type\s[^;]*;/gm,
    "",
  );
  return [...source.matchAll(specifiers)]
    .map((match) => match[1])
    .filter((specifier): specifier is string => Boolean(specifier));
}

/** Every module an entry reaches, with the bare packages each one imports. */
function bundle(entry: string) {
  const modules = new Map<string, string[]>();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop() as string;
    if (modules.has(file)) {
      continue;
    }
    const packages: string[] = [];
    modules.set(file, packages);
    for (const specifier of imports(file)) {
      const next = resolveModule(file, specifier);
      if (next) {
        pending.push(next);
      } else if (!specifier.startsWith(".")) {
        packages.push(specifier);
      }
    }
  }
  return modules;
}

void test("the app bundle reaches no server/ module or Node builtin", () => {
  const violations: string[] = [];
  const modules = bundle(join(root, "app.tsx"));
  assert.ok(modules.size > 1, "found no app modules");
  for (const [file, packages] of modules) {
    if (!file.startsWith(coreRoot) && path(file).startsWith("server/")) {
      violations.push(`${path(file)} is in the app bundle`);
    }
    for (const specifier of packages) {
      if (specifier.startsWith("node:") || builtins.has(specifier)) {
        violations.push(`${path(file)} imports ${specifier}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});
