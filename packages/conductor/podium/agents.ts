import type { AgentItem } from "../agents/models";
import type { ProviderCatalog } from "../symphonies/profiles-contracts";
import type { Filter } from "../agents/attention";

/**
 * The agent's worker labels through the provider catalog: the catalog's
 * provider and model labels, falling back to the raw ids the item carries.
 * An agent item recorded before snapshots carried models has no model label.
 * Shared with the request detail, which shows the same mark plus model —
 * the provider stays in the accessible label there too.
 */
export function agentWorker(
  item: AgentItem,
  catalog: ProviderCatalog | undefined,
): { providerLabel: string; modelLabel: string | null } {
  const entry = catalog?.providers.find(
    (provider) => provider.id === item.provider,
  );
  const modelEntry = item.model
    ? entry?.models.find((model) => model.id === item.model)
    : undefined;
  return {
    providerLabel: entry?.label ?? item.provider,
    modelLabel: modelEntry?.label ?? item.model ?? null,
  };
}

/** The Agents queue filters, in toolbar order, with their Lucide icons. */
export const AGENT_FILTERS: readonly {
  id: Filter;
  label: string;
  icon: string;
}[] = [
  { id: "attention", label: "Needs attention", icon: "Bell" },
  { id: "running", label: "Running", icon: "Activity" },
  { id: "inactive", label: "Inactive", icon: "CirclePause" },
  { id: "all", label: "All", icon: "ListChecks" },
];

/** What the request detail says about a response's delivery. */
export const DELIVERY_MESSAGES = {
  sending: "Sending your response…",
  answered:
    "Response delivered. The agent’s next activity will appear after refresh.",
  unknown:
    "Delivery is uncertain. Do not resend here. Open the agent and verify its current request.",
  stale:
    "This request changed or was resolved elsewhere. Your draft remains attached to the original request.",
  unsupported:
    "This request needs its native controls. Open the agent to respond.",
};

/** Why an archive was refused, naming the host where children are managed. */
export function archiveErrors(hostName: string) {
  return {
    stale:
      "The agent changed. Refresh and check its current state before archiving.",
    has_children: `This agent has children. Archive or detach them in ${hostName} before archiving this parent.`,
    incomplete:
      "The directory is incomplete, so child agents cannot be checked. Refresh before archiving.",
    unknown:
      "The archive could not be confirmed. Refresh or open the agent to check its state before trying again.",
  };
}

/**
 * The agents whose open requests the next snapshot must keep checking, from
 * the previous snapshot; bounded like the RPC input.
 */
export function knownAgentIds(
  previous:
    | { items: readonly Pick<AgentItem, "agentId" | "requestId">[] }
    | undefined,
): string[] {
  return [
    ...new Set(
      previous?.items
        .filter((item) => item.requestId !== null)
        .map((item) => item.agentId) ?? [],
    ),
  ].slice(0, 2000);
}
