import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { symphonyAck } from "conductor/commands/ack";
import { COMMAND_LIMITS } from "conductor/commands/limits";
import { commandTools } from "conductor/commands/tools";
import { SymphonyError } from "conductor/symphonies/errors";
import type { AgentIds } from "../engine/bb/agent-ids";
import type { SymphonyService } from "./symphonies";

export const TOOL_PREFIX = "conductor_";

const guidance = `[Conductor agent commands]
Conductor commands are the bb tools named ${TOOL_PREFIX}<command>, such as ${TOOL_PREFIX}orchestrate, ${TOOL_PREFIX}define, ${TOOL_PREFIX}dispatch, ${TOOL_PREFIX}report and ${TOOL_PREFIX}finish. When a Conductor prompt names a command or tool such as \`report\`, call ${TOOL_PREFIX}report. bb binds your thread identity to each call. Never run Conductor commands through a shell.
When the user asks to orchestrate work, call ${TOOL_PREFIX}orchestrate with a stable key, title and goal. You become the symphony's Conductor agent: the result explains how to split the work and dispatch task threads from this conversation. Follow the bb-conductor-orchestrate skill. Do not substitute a source-only start symphony for orchestration. Small edits need no symphony unless requested.
Inspect each tool result; an error result is not an acknowledgement. An assigned task agent uses report, block, get and widen for its existing symphony and attempt; never start another symphony for that assignment. Report actual evidence and required checks, then stop tool work and end the turn. Never infer completion from idle. Preserve the user's permissions and authorized scope.`;

function errorMessage(error: unknown): string {
  if (error instanceof SymphonyError) {
    return error.message;
  }
  if (error instanceof z.ZodError) {
    return "Invalid command fields. Check the tool's input schema.";
  }
  return "The command could not be checked or saved. Inspect the symphony before retrying.";
}

function failure(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

/** Registers one native bb tool per Conductor command. */
export function registerTools(
  bb: Pick<BbPluginApi, "agents">,
  service: Pick<SymphonyService, "execution">,
  ids: AgentIds,
  ready: Promise<void>,
  changed: () => void = () => undefined,
): void {
  for (const tool of commandTools) {
    bb.agents.registerTool({
      name: `${TOOL_PREFIX}${tool.name}`,
      description: tool.description,
      parameters: tool.inputSchema as Record<string, unknown>,
      ...(tool.name === "orchestrate" ? { instructions: guidance } : {}),
      presentation: {
        label: {
          pending: `Conductor ${tool.name}`,
          completed: `Conductor ${tool.name}`,
        },
      },
      async execute(params, { threadId }) {
        if (!params || typeof params !== "object" || Array.isArray(params)) {
          return failure("Command input must be a JSON object.");
        }
        try {
          await ready;
          const agentId = await ids.agentOf(threadId);
          const result = JSON.stringify(
            symphonyAck(
              await service.execution.execute({
                agentId,
                command: { ...params, kind: tool.name },
              }),
            ),
          );
          if (Buffer.byteLength(result) > COMMAND_LIMITS.responseBytes) {
            return failure("The response exceeds the command size limit.");
          }
          return result;
        } catch (error) {
          return failure(errorMessage(error));
        } finally {
          changed();
        }
      },
    });
  }
}
