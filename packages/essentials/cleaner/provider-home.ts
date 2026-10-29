import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { providerHomeEnv, type NativeSession } from "./contracts";

const DEFAULT_DIRECTORY = {
  codex: ".codex",
  "claude-code": ".claude",
} as const;

/**
 * The recorded home, else this host's override variable, else the provider
 * default. Expands `~`. A relative path or the filesystem root is refused.
 */
export function resolveProviderHome(
  session: Pick<NativeSession, "provider" | "home">,
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): string {
  const value =
    session.home ||
    env[providerHomeEnv[session.provider]]?.trim() ||
    join(home, DEFAULT_DIRECTORY[session.provider]);

  if (!value.startsWith("/") && value !== "~" && !value.startsWith("~/")) {
    throw new Error(
      "Relative provider session directories cannot be resolved safely.",
    );
  }

  const expanded = value.startsWith("~") ? join(home, value.slice(1)) : value;
  const resolved = resolve(expanded);

  if (dirname(resolved) === resolved) {
    throw new Error(
      "Refusing the filesystem root as a provider data directory.",
    );
  }

  return resolved;
}
