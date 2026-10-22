import type { Harness } from "essentials/harnesses";

/**
 * bb agent provider IDs for each coding CLI, preferred first. bb runs
 * OpenCode over ACP as `acp-opencode`.
 */
const bbProviders = {
  claude: ["claude-code"],
  codex: ["codex"],
  opencode: ["acp-opencode", "opencode"],
  pi: ["pi"],
} as const satisfies Record<Harness, readonly string[]>;

export function bbProvidersOf(harness: Harness): readonly string[] {
  return bbProviders[harness];
}
