import { useSyncExternalStore } from "react";
import type {
  CleanerCandidate,
  CleanerStatus,
} from "essentials/cleaner/contracts";

/**
 * bb renders registered icons and sidebar footer actions outside the plugin
 * runtime, where plugin hooks fail. The CleanerSync overlay owns the RPC and
 * publishes a plain snapshot here, and the footer action opens the dialog
 * here.
 */
function externalStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  const get = () => value;
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  return {
    set(next: T) {
      if (Object.is(value, next)) {
        return;
      }
      value = next;
      for (const listener of listeners) {
        listener();
      }
    },
    use: () => useSyncExternalStore(subscribe, get, get),
  };
}

export interface CleanerSnapshot {
  status: CleanerStatus | null;
  error: string | null;
}

const snapshot = externalStore<CleanerSnapshot>({ status: null, error: null });
const dialogOpen = externalStore(false);

export const setCleanerSnapshot = (next: CleanerSnapshot) => snapshot.set(next);
export const useCleanerSnapshot = snapshot.use;
export const useCleanerDialogOpen = dialogOpen.use;
export const openCleaner = () => dialogOpen.set(true);
export const closeCleaner = () => dialogOpen.set(false);

/** The footer dot: old threads to review, or a cleanup problem. */
export function needsAttention({ status, error }: CleanerSnapshot): boolean {
  return (
    !!error ||
    !!status?.scanError ||
    !!status?.problems.length ||
    (status?.oldThreadCount ?? 0) > 0
  );
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** The threads below a candidate, without the candidate itself. */
export function dependents(entry: CleanerCandidate) {
  return entry.members.filter((member) => member.id !== entry.id);
}

export function threadCount(entries: readonly CleanerCandidate[]): number {
  return entries.reduce((sum, entry) => sum + entry.members.length, 0);
}
