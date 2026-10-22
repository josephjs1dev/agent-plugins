import type { CliId } from "./cli-maintenance";
import { inspectInstallation } from "./cli-installation";
import { run } from "./cli-process";

const CACHE_WARNING =
  " The CLI cache could not be refreshed; check its version and connection.";

/**
 * Refreshes the model cache of a CLI that keeps one (OpenCode and Pi).
 * Returns a warning suffix for the refresh message, or "" on success and for
 * CLIs without a cache command.
 */
export async function refreshCliCache(
  id: CliId,
  readOverride: () => Promise<unknown>,
  signal: AbortSignal,
): Promise<string> {
  if (id !== "opencode" && id !== "pi") {
    return "";
  }

  try {
    const installation = await inspectInstallation(
      id,
      await readOverride(),
      signal,
    );
    const args =
      id === "opencode"
        ? ["models", "--refresh"]
        : ["update", "--models", "--no-approve"];

    if (
      id === "pi" &&
      !(
        await run(
          installation.executable,
          ["update", "--help"],
          installation.env,
          signal,
        )
      ).includes("--models")
    ) {
      throw new Error("Pi model refresh requires a newer CLI.");
    }

    await run(installation.executable, args, installation.env, signal, 45_000);

    return "";
  } catch {
    return CACHE_WARNING;
  }
}
