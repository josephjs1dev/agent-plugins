import type { BbSdk, BbThread } from "./types";

export function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const { status, code, message } = error as Record<string, unknown>;
  return (
    status === 404 ||
    (typeof code === "string" && /not[_ ]?found/i.test(code)) ||
    (typeof message === "string" && /not[_ ]?found|\b404\b/i.test(message))
  );
}

/** Thread reads that treat a missing thread or environment as absent. */
export function threadReads(sdk: () => BbSdk) {
  return {
    async thread(threadId: string): Promise<BbThread | null> {
      try {
        return await sdk().threads.get({ threadId });
      } catch (error) {
        if (isNotFound(error)) {
          return null;
        }
        throw error;
      }
    },
    async executionOptions(threadId: string) {
      try {
        return await sdk().threads.defaultExecutionOptions({ threadId });
      } catch {
        return null;
      }
    },
    async environmentPath(environmentId: string | null): Promise<string> {
      if (!environmentId) {
        return "";
      }
      try {
        return (await sdk().environments.get({ environmentId })).path ?? "";
      } catch {
        return "";
      }
    },
  };
}
export type ThreadReads = ReturnType<typeof threadReads>;
