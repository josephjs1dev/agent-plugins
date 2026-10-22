import type { CliId } from "essentials/cli-maintenance";
import type { Harness } from "essentials/harnesses";

/**
 * bb agent provider IDs for the coding CLIs Essentials knows. Usage history
 * names a CLI by its harness, which is also its maintenance ID.
 */
const bbProviders = {
  claude: "claude-code",
  codex: "codex",
  opencode: "opencode",
  pi: "pi",
} as const satisfies Record<Harness & CliId, string>;

export function bbProviderOf(id: CliId): string {
  return bbProviders[id];
}

/** The harness behind a bb provider ID, or null for other providers. */
export function harnessOf(providerId: string): Harness | null {
  for (const [harness, id] of Object.entries(bbProviders)) {
    if (id === providerId) {
      return harness as Harness;
    }
  }
  return null;
}
