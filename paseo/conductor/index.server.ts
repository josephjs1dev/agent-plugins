import type { PluginServerContext } from "@getpaseo/plugin/server";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileStore } from "conductor/agents/store";
import { turnJournal } from "conductor/agents/turns";
import { registerAgentsRpc } from "./server/entrypoints/agents-rpc";
import { observeTurns } from "./server/entrypoints/agents-events";
import { registerSymphonies } from "./server/entrypoints/symphonies-rpc";
import { registerSkillsRpc } from "./server/entrypoints/skills-rpc";
import {
  adoptHostDirectory,
  adoptLegacyHome,
  conductorHome,
} from "conductor/home";

export default function contribute(
  server: PluginServerContext,
): () => Promise<void> {
  const home = conductorHome();
  const root = adoptLegacyHome(
    home,
    join(
      process.env.PASEO_HOME ?? join(homedir(), ".paseo"),
      "plugin-data",
      "conductor",
    ),
  );
  // Paseo keeps its own symphonies, as bb does: another host's reconciler
  // would treat Paseo agents as missing. Worker profiles stay shared in the
  // home. A kept legacy directory holds both, as before.
  const directory =
    root === home ? adoptHostDirectory(home, join(home, "paseo")) : root;
  const turns = turnJournal(join(directory, "turns"));
  const stopSymphonies = registerSymphonies(server, directory, root);
  const stopTurns = observeTurns(server, turns);
  registerSkillsRpc(server, homedir());
  registerAgentsRpc(server, fileStore(directory), turns);
  return async () => {
    try {
      await stopTurns();
    } finally {
      await stopSymphonies();
    }
  };
}
