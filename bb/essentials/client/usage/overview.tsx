import {
  providerDefinitions,
  providerIds,
  type Provider,
} from "essentials/providers";
import { ProviderMark } from "./provider-mark";
import { QuotaCard } from "./quota-card";
import { useUsage } from "./use-usage";

function ProviderQuota({ provider }: { provider: Provider }) {
  const query = useUsage(provider);
  return (
    <section
      aria-label={`${providerDefinitions[provider].name} quota`}
      className="flex gap-4 rounded-lg border bg-card p-4"
    >
      <ProviderMark provider={provider} className="mt-1 size-6 shrink-0" />
      <div className="min-w-0 flex-1">
        <QuotaCard provider={provider} query={query} />
      </div>
    </section>
  );
}

/** Every provider's quota card, for the Essentials page. */
export function QuotaOverview() {
  return (
    <div className="space-y-4">
      {providerIds.map((provider) => (
        <ProviderQuota key={provider} provider={provider} />
      ))}
    </div>
  );
}
