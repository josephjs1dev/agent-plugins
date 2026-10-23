/** The Podium nav panel's path. */
export const PODIUM_PATH = "podium";

const SYMPHONY_PREFIX = "symphonies/";

/** The Podium sub-path that opens one symphony's detail. */
export function symphonySubPath(symphonyId: string): string {
  return `${SYMPHONY_PREFIX}${symphonyId}`;
}

/** The symphony a Podium sub-path opens, or null for any other sub-path. */
export function symphonyIdOf(subPath: string): string | null {
  return subPath.startsWith(SYMPHONY_PREFIX)
    ? subPath.slice(SYMPHONY_PREFIX.length) || null
    : null;
}
