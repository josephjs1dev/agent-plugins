import { useState } from "react";
import type { PluginThreadHeaderActionProps } from "@get-bb/plugin-sdk/app";
import {
  providerDefinitions,
  providerIds,
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
import { ProviderSwitcher } from "./provider-mark";
import { QuotaCard } from "./quota-card";
import { useUsage } from "./use-usage";

const FIRST_PROVIDER: Provider = providerIds[0] ?? "chatgpt";

/**
 * The thread header's quota control. Each mounted header keeps its own
 * selected provider, so split panes choose independently.
 */
export function ProviderUsageButton({
  isCompactViewport,
}: PluginThreadHeaderActionProps) {
  const [provider, setProvider] = useState<Provider>(FIRST_PROVIDER);
  const [open, setOpen] = useState(false);
  const query = useUsage(provider);
  const openHistory = useOpenHistory();
  const name = providerDefinitions[provider].name;
  const label = query.usage ? usageLabel(query.usage) : `${name} · …`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <HeaderTrigger
          icon={ICONS.gauge}
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
                openHistory(provider, 7, "host");
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
