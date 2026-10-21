#!/usr/bin/env node
// Copy a plugin's core files from its Paseo adapter into another host adapter.
//
// The Paseo adapter is the source of truth. Its `.core-files` lists the
// host-neutral core: the domain modules in shared/ and server/core/, and their
// tests. Hosts install one plugin directory on its own, so every other adapter
// commits a copy of those files at the same paths. Relative imports therefore
// stay valid. The copy's `.core-files` lists what it holds; edit the files in
// the Paseo adapter, never in the copy.
//
// Usage: node scripts/sync-core.mjs <plugin> <host> [--check]
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sourceHost = "paseo";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [plugin, host, flag] = process.argv.slice(2);
if (!plugin || !host || (flag && flag !== "--check")) {
  console.error("Usage: node scripts/sync-core.mjs <plugin> <host> [--check]");
  process.exit(2);
}
if (host === sourceHost) {
  console.error(`${sourceHost}/${plugin} is the source of the core; sync another host.`);
  process.exit(2);
}
const source = join(root, sourceHost, plugin);
const target = join(root, host, plugin);
const sourceManifest = join(source, ".core-files");
const targetManifest = join(target, ".core-files");
if (!existsSync(sourceManifest)) {
  console.error(`Missing ${sourceHost}/${plugin}/.core-files`);
  process.exit(2);
}

const readList = async (path) =>
  existsSync(path)
    ? (await readFile(path, "utf8")).split("\n").filter(Boolean)
    : [];
const files = (await readList(sourceManifest)).sort();
const missing = files.filter((file) => !existsSync(join(source, file)));
if (missing.length) {
  console.error(
    `${sourceHost}/${plugin}/.core-files lists missing files:\n` +
      missing.map((file) => `  ${file}`).join("\n"),
  );
  process.exit(1);
}
const previous = await readList(targetManifest);
const stale = previous.filter((file) => !files.includes(file));
const changed = [];
for (const file of files) {
  const copy = join(target, file);
  if (
    !existsSync(copy) ||
    !(await readFile(copy)).equals(await readFile(join(source, file)))
  ) {
    changed.push(file);
  }
}
const listing = `${files.join("\n")}\n`;
const listingChanged =
  !existsSync(targetManifest) ||
  (await readFile(targetManifest, "utf8")) !== listing;

if (flag === "--check") {
  const drift = [
    ...changed,
    ...stale.filter((file) => existsSync(join(target, file))),
  ];
  if (drift.length || listingChanged) {
    console.error(
      `${host}/${plugin} is out of sync with ${sourceHost}/${plugin}:\n` +
        drift.map((file) => `  ${file}`).join("\n") +
        `\nRun: node scripts/sync-core.mjs ${plugin} ${host}`,
    );
    process.exit(1);
  }
  process.exit(0);
}
for (const file of changed) {
  await mkdir(dirname(join(target, file)), { recursive: true });
  await writeFile(join(target, file), await readFile(join(source, file)));
}
for (const file of stale) {
  await rm(join(target, file), { force: true });
  // Remove directories the stale file leaves empty.
  for (
    let directory = dirname(join(target, file));
    directory.startsWith(target) && directory !== target;
    directory = dirname(directory)
  ) {
    if (!existsSync(directory) || (await readdir(directory)).length > 0) {
      break;
    }
    await rmdir(directory);
  }
}
await mkdir(target, { recursive: true });
await writeFile(targetManifest, listing);
console.log(
  `Synced ${files.length} core files from ${sourceHost}/${plugin} into ${host}/${plugin} (${changed.length} changed, ${stale.length} removed).`,
);
