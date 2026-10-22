import { cliCommand, defineCli, type BbPluginApi } from "@get-bb/plugin-sdk";
import type { SymphonyService } from "./symphonies";

/** `bb conductor list`: the symphonies bb's Conductor stores. */
export function registerCli(
  bb: Pick<BbPluginApi, "cli">,
  service: Pick<SymphonyService, "store">,
): void {
  bb.cli.register(
    defineCli({
      name: "conductor",
      summary: "Inspect Conductor symphonies",
      commands: {
        list: cliCommand({
          summary: "List stored symphonies with their status",
          options: {
            json: {
              type: "boolean",
              description: "Emit machine-readable JSON",
            },
          },
          async run(input) {
            const { symphonies, unavailable } = await service.store.list();
            if (input.options.json) {
              return {
                exitCode: 0,
                stdout: JSON.stringify({ symphonies, unavailable }),
              };
            }
            const lines = symphonies.map(
              (entry) => `${entry.id}  ${entry.status}  ${entry.title}`,
            );
            if (unavailable > 0) {
              lines.push(`${unavailable} symphonies could not be read.`);
            }
            return {
              exitCode: 0,
              stdout: lines.length ? lines.join("\n") : "No symphonies.",
            };
          },
        }),
      },
    }),
  );
}
