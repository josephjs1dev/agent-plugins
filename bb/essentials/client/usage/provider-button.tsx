import { useEffect, useState } from "react";
import {
  experimental_useSidebarThreads as useSidebarThreads,
  useSdk,
  type PluginThreadHeaderActionProps,
} from "@get-bb/plugin-sdk/app";
import {
  providerDefinitions,
  providerIds,
  providerOfModel,
  type Provider,
} from "essentials/providers";
import { usageLabel } from "essentials/usage";
import { Icon } from "@/components/ui/icon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ICONS } from "../../shared/icons";
import { useOpenHistory } from "../navigation";
import { HeaderTrigger } from "./header-trigger";
import {
  ProviderMark,
  ProviderSwitcher,
  quotaProviderOf,
} from "./provider-mark";
import { QuotaCard } from "./quota-card";
import { useUsage } from "./use-usage";

const FIRST_PROVIDER: Provider = providerIds[0] ?? "chatgpt";

/**
 * The thread's model, refetched whenever the thread changes. Null until it
 * loads, or when bb cannot report it.
 */
function useThreadModel(
  threadId: string,
  updatedAt: number | undefined,
): string | null {
  const sdk = useSdk();
  const [loaded, setLoaded] = useState<{
    threadId: string;
    model: string | null;
  } | null>(null);
  useEffect(() => {
    if (updatedAt === undefined) {
      return;
    }
    const controller = new AbortController();
    sdk.threads
      .defaultExecutionOptions({ threadId, signal: controller.signal })
      .then(
        (options) => setLoaded({ threadId, model: options?.model ?? null }),
        // Without a model, the agent provider still picks the subscription.
        () => undefined,
      );
    return () => controller.abort();
  }, [sdk, threadId, updatedAt]);
  return loaded?.threadId === threadId ? loaded.model : null;
}

/**
 * The quota provider of the thread's model, such as OpenCode Go for Pi on
 * `opencode-go/…`, else of its agent provider, or null for others.
 */
function useThreadQuotaProvider(threadId: string): Provider | null {
  const { threads } = useSidebarThreads();
  const thread = threads.find((candidate) => candidate.id === threadId);
  const model = useThreadModel(threadId, thread?.updatedAt);
  if (!thread) {
    return null;
  }
  return (
    (model === null ? undefined : providerOfModel(model)) ??
    quotaProviderOf(thread.providerId)
  );
}

/**
 * The thread header's quota control. It follows the subscription behind the
 * thread's model or provider. A provider picked in the popover holds until
 * that subscription changes. Each mounted header keeps its own pick, so split
 * panes choose independently.
 */
export function ProviderUsageButton({
  threadId,
  isCompactViewport,
}: PluginThreadHeaderActionProps) {
  const threadProvider = useThreadQuotaProvider(threadId);
  const [picked, setPicked] = useState<{
    threadProvider: Provider | null;
    provider: Provider;
  } | null>(null);
  const provider =
    picked?.threadProvider === threadProvider
      ? picked.provider
      : (threadProvider ?? FIRST_PROVIDER);
  const setProvider = (next: Provider) =>
    setPicked({ threadProvider, provider: next });
  const [open, setOpen] = useState(false);
  const query = useUsage(provider);
  const openHistory = useOpenHistory();
  const name = providerDefinitions[provider].name;
  const label = query.usage ? usageLabel(query.usage) : `${name} · …`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <HeaderTrigger
          icon={<ProviderMark provider={provider} className="size-4" />}
          label={label}
          compact={isCompactViewport}
        />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        mobileTitle="Provider usage"
        className="w-[30rem] max-w-[calc(100vw-2rem)]"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-5">
          <div className="shrink-0 border-b pb-3 sm:border-r sm:border-b-0 sm:pr-3 sm:pb-0">
            <ProviderSwitcher
              value={provider}
              onChange={setProvider}
              vertical
            />
          </div>
          <div className="min-w-0 flex-1 space-y-4">
            <QuotaCard key={provider} provider={provider} query={query} />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openHistory(provider, 7);
              }}
              className="flex min-h-10 w-full items-center justify-between gap-3 border-t pt-3 text-sm font-medium hover:text-foreground"
            >
              Usage history
              <Icon
                name={ICONS.chart}
                fallback="ArrowUpRight"
                aria-hidden
                className="size-4 text-muted-foreground"
              />
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
