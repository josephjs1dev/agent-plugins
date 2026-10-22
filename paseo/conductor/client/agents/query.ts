import { useRpc } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAgents } from "../../shared/agents/rpc";
import type { AgentsSnapshot } from "conductor/agents/models";
import { knownAgentIds } from "conductor/podium/agents";
import { useDirectoryInvalidation } from "../paseo/use-directory";

export const agentsQueryKey = (hostId: string) =>
  ["conductor", hostId, "agents"] as const;
export function useAgents(hostId: string) {
  const fetch = useRpc(getAgents);
  const cache = useQueryClient();
  useDirectoryInvalidation([...agentsQueryKey(hostId)]);
  const query = useQuery({
    queryKey: agentsQueryKey(hostId),
    queryFn: () => {
      const previous = cache.getQueryData<AgentsSnapshot>(
        agentsQueryKey(hostId),
      );
      return fetch({ knownAgentIds: knownAgentIds(previous) });
    },
    retry: false,
    staleTime: 2000,
    refetchInterval: 15_000,
  });
  return query;
}
