import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { test } from "node:test";

// Paseo's plugin compiler rules: code lives in client/, server/ or shared/, or
// in the linked conductor package; the app bundle reaches no server/ or Node
// module; the daemon bundle reaches no client/ or React module; shared/
// imports only shared code and Node-free package modules. Type imports and
// transitive dependencies count, including inside the package.
const root = resolve(import.meta.dirname, "..");
const corePackage = "conductor";
const coreRoot = resolve(root, "../../packages", corePackage);
const builtins = new Set(builtinModules);
const specifiers = /(?<![.\w$])(?:from|import)\s*\(?\s*["']([^"'\n]+)["']/g;
const sharedPackages = new Set(["zod", "@getpaseo/plugin"]);
const clientOnlyPackages =
  /^(react|react-native|@getpaseo\/plugin\/client)(\/|$)/;

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
  if (specifier.startsWith(`${corePackage}/`)) {
    return existing(join(coreRoot, specifier.slice(corePackage.length + 1)));
  }

  return null;
}

function imports(file: string) {
  return [...readFileSync(file, "utf8").matchAll(specifiers)]
    .map((match) => match[1])
    .filter((specifier): specifier is string => Boolean(specifier));
}

function isBuiltin(specifier: string) {
  return specifier.startsWith("node:") || builtins.has(specifier);
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

function files(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);

    if (entry.isDirectory()) {
      return files(file);
    }

    return /\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

function runtimeDirectory(file: string) {
  return file.startsWith(coreRoot) ? corePackage : path(file).split("/")[0];
}

void test("the app bundle reaches only client/, shared/ and Node-free package code", () => {
  const violations: string[] = [];

  for (const [file, packages] of bundle(join(root, "index.client.tsx"))) {
    const directory = runtimeDirectory(file);

    if (
      file !== join(root, "index.client.tsx") &&
      !["client", "shared", corePackage].includes(directory ?? "")
    ) {
      violations.push(`${path(file)} is in the app bundle`);
    }

    for (const specifier of packages.filter(isBuiltin)) {
      violations.push(`${path(file)} imports ${specifier}`);
    }
  }

  assert.deepEqual(violations, []);
});

void test("the daemon bundle reaches only server/, shared/ and package code", () => {
  const violations: string[] = [];

  for (const [file, packages] of bundle(join(root, "index.server.ts"))) {
    const directory = runtimeDirectory(file);

    if (
      file !== join(root, "index.server.ts") &&
      !["server", "shared", corePackage].includes(directory ?? "")
    ) {
      violations.push(`${path(file)} is in the daemon bundle`);
    }

    for (const specifier of packages.filter((name) =>
      clientOnlyPackages.test(name),
    )) {
      violations.push(`${path(file)} imports ${specifier}`);
    }
  }

  assert.deepEqual(violations, []);
});

void test("shared/ modules reach only shared code and Node-free package code", () => {
  const sharedFiles = files(join(root, "shared"));
  const violations: string[] = [];

  assert.ok(sharedFiles.length > 0, "found no shared modules");

  for (const file of sharedFiles) {
    for (const specifier of imports(file)) {
      const next = resolveModule(file, specifier);

      if (specifier.startsWith(".")) {
        if (!next || runtimeDirectory(next) !== "shared") {
          violations.push(`${path(file)} imports ${specifier}`);
        }
      } else if (!next && !sharedPackages.has(specifier)) {
        violations.push(`${path(file)} imports ${specifier}`);
      }
    }
    for (const [reached, packages] of bundle(file)) {
      for (const specifier of packages.filter(isBuiltin)) {
        violations.push(
          `${path(file)} reaches ${specifier} through ${path(reached)}`,
        );
      }
    }
  }

  assert.deepEqual([...new Set(violations)], []);
});
