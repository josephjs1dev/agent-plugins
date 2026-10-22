import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ORCHESTRATE_SKILL } from "./conductor-orchestrate";

// Installed copies carry this marker so updates and removal never touch a
// skill the user created with the same name.
const MARKER = ".paseo-conductor";

/** Every skill Conductor ships; each installs as `<name>/SKILL.md`. */
export const SKILLS: ReadonlyArray<{ name: string; content: string }> = [
  { name: "paseo-conductor-orchestrate", content: ORCHESTRATE_SKILL },
];

/**
 * Names Conductor installed before. Install and removal delete a copy that
 * carries the marker, so a renamed skill never lingers beside its successor.
 */
const RETIRED = ["conductor-orchestrate"];

export interface SkillResult {
  changed: string[];
  skipped: string[];
}

function targets(home: string): Array<{ path: string; content: string }> {
  return SKILLS.flatMap(({ name, content }) =>
    [".claude", ".agents"].map((dir) => ({
      path: join(home, dir, "skills", name),
      content,
    })),
  );
}

function retired(home: string): string[] {
  return RETIRED.flatMap((name) =>
    [".claude", ".agents"].map((dir) => join(home, dir, "skills", name)),
  );
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

/** null: absent; true: installed by Conductor; false: someone else's skill. */
async function owned(target: string): Promise<boolean | null> {
  if (!(await exists(target))) {
    return null;
  }
  return exists(join(target, MARKER));
}

async function removeRetired(home: string, result: SkillResult) {
  for (const path of retired(home)) {
    if (await owned(path)) {
      await rm(path, { recursive: true, force: true });
      result.changed.push(path);
    }
  }
}

export async function installSkills(home: string): Promise<SkillResult> {
  const result: SkillResult = { changed: [], skipped: [] };
  await removeRetired(home, result);
  for (const { path, content } of targets(home)) {
    if ((await owned(path)) === false) {
      result.skipped.push(path);
      continue;
    }
    await mkdir(path, { recursive: true });
    await writeFile(join(path, "SKILL.md"), content);
    await writeFile(join(path, MARKER), "");
    result.changed.push(path);
  }
  return result;
}

export async function removeSkills(home: string): Promise<SkillResult> {
  const result: SkillResult = { changed: [], skipped: [] };
  await removeRetired(home, result);
  for (const { path } of targets(home)) {
    const state = await owned(path);
    if (state === false) {
      result.skipped.push(path);
    } else if (state) {
      await rm(path, { recursive: true, force: true });
      result.changed.push(path);
    }
  }
  return result;
}
