import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { CollectLinks, SessionLink } from "essentials/workspace-sessions";
import { harnessOf } from "../../../shared/providers";

type Sdk = BbPluginApi["sdk"];
type Thread = Awaited<ReturnType<Sdk["threads"]["list"]>>[number];
type Context = Awaited<ReturnType<Sdk["threads"]["context"]>>;

const PAGE = 200;
/** Bounds one environment's sync: threads read, and context reads at once. */
const MAX_THREADS = 400;
const CONCURRENCY = 8;

/**
 * The provider session behind a thread's latest context reading. bb reports
 * one session per reading, so a thread that cleared its context links only
 * the sessions it reported while Essentials ran.
 */
export function sessionLink(
  thread: Pick<Thread, "environmentId" | "providerId" | "updatedAt">,
  context: Context,
): SessionLink | null {
  const harness = harnessOf(thread.providerId);
  const snapshot = context.usage?.snapshot;
  const sessionId = snapshot?.providerSessionId;
  if (!thread.environmentId || !harness || !sessionId) {
    return null;
  }
  if (sessionId.length > 160) {
    return null;
  }
  // The reading's capture time is when the session last ran here.
  const capturedAt = Date.parse(snapshot.capturedAt);
  const seenAt = Number.isNaN(capturedAt) ? thread.updatedAt : capturedAt;
  return {
    workspaceId: thread.environmentId,
    harness,
    sessionId,
    seenAt: new Date(seenAt).toISOString(),
  };
}

async function threadsIn(sdk: Sdk, environmentId: string): Promise<Thread[]> {
  const threads: Thread[] = [];
  for (const archived of [false, true]) {
    for (let offset = 0; threads.length < MAX_THREADS; offset += PAGE) {
      const page = await sdk.threads.list({
        environmentId,
        archived,
        includeHidden: true,
        limit: PAGE,
        offset,
      });
      threads.push(...page);
      if (page.length < PAGE) {
        break;
      }
    }
  }
  return threads.slice(0, MAX_THREADS);
}

/** Collects the session links of an environment's threads, archived included. */
export function environmentLinks(sdk: () => Sdk): CollectLinks {
  return async (environmentId) => {
    const threads = (await threadsIn(sdk(), environmentId)).filter(
      (thread) => harnessOf(thread.providerId) !== null,
    );
    const links: SessionLink[] = [];
    for (let start = 0; start < threads.length; start += CONCURRENCY) {
      const batch = threads.slice(start, start + CONCURRENCY);
      const read = await Promise.all(
        batch.map(async (thread) => {
          try {
            return sessionLink(
              thread,
              await sdk().threads.context({ threadId: thread.id }),
            );
          } catch {
            // A thread without a loaded runtime has no reading to link.
            return null;
          }
        }),
      );
      for (const link of read) {
        if (link) {
          links.push(link);
        }
      }
    }
    return links;
  };
}
