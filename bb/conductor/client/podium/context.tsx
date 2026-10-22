import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { PodiumSession, type ViewState } from "conductor/podium/session";
import { errorMessage, usePodiumRpc } from "../data";

/** How often relative times ("3m ago") refresh, as in the Paseo Podium. */
const CLOCK_MS = 15_000;

interface Podium {
  session: PodiumSession;
  /** Opens a Conductor agent's bb thread, in a split when asked. */
  openAgent(this: void, agentId: string, split?: boolean): void;
}

const PodiumContext = createContext<Podium | null>(null);

export function PodiumProvider({ children }: { children: ReactNode }) {
  const [session] = useState(() => new PodiumSession());
  const rpc = usePodiumRpc();
  const navigate = useBbNavigate();
  useEffect(() => () => session.clear(), [session]);
  const openAgent = useCallback(
    (agentId: string, split = false) => {
      rpc.call("agents.thread", { agentId }).then(
        ({ threadId }) => navigate.toThread(threadId, { split }),
        (cause: unknown) => toast.error(errorMessage(cause)),
      );
    },
    [rpc, navigate],
  );
  const value = useMemo(() => ({ session, openAgent }), [session, openAgent]);
  return (
    <PodiumContext.Provider value={value}>{children}</PodiumContext.Provider>
  );
}

export function usePodium(): Podium {
  const podium = useContext(PodiumContext);
  if (!podium) {
    throw new Error("usePodium must be used inside PodiumProvider.");
  }
  return podium;
}

/** The Podium's view state; components rerender when it changes. */
export function useViewState(): ViewState {
  const { session } = usePodium();
  return useSyncExternalStore(session.subscribe, session.getSnapshot);
}

/** The current time, refreshed for relative-time labels. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}
