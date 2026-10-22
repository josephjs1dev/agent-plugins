import { useEffect, useMemo, useState } from "react";
import { knownAgentIds } from "conductor/podium/agents";
import type { ProviderCatalog } from "conductor/symphonies/profiles-contracts";
import { usePodiumQuery } from "../data";

/**
 * The Agents snapshot. Each read passes the agents with open requests in the
 * previous snapshot, so an incomplete directory still rechecks them.
 */
export function useAgents() {
  const [known, setKnown] = useState<string[]>([]);
  const query = usePodiumQuery("agents.get", { knownAgentIds: known });
  const next = useMemo(
    () => knownAgentIds(query.data ?? undefined),
    [query.data],
  );
  useEffect(() => {
    setKnown((current) =>
      current.join("\n") === next.join("\n") ? current : next,
    );
  }, [next]);
  return query;
}

/**
 * The provider catalog for worker labels. A failed read leaves the raw
 * provider and model ids, which every worker line already falls back to.
 */
export function useProviderCatalog(): ProviderCatalog | undefined {
  return usePodiumQuery("profiles.providers", {}).data ?? undefined;
}
