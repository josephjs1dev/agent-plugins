import {
  experimental_ProviderIcon as ProviderIcon,
  experimental_useProviders as useProviders,
} from "@get-bb/plugin-sdk/app";
import {
  providerDefinitions,
  providerIds,
  type Provider,
} from "essentials/providers";
import { cn } from "@/lib/utils";
import { bbProvidersOf } from "../../shared/providers";

/** The bb agent providers that run on each quota provider's subscription. */
const AGENT_PROVIDERS: Record<Provider, readonly string[]> = {
  chatgpt: bbProvidersOf("codex"),
  claude: bbProvidersOf("claude"),
  "opencode-go": bbProvidersOf("opencode"),
};

/** The quota provider behind a bb agent provider, or null for others. */
export function quotaProviderOf(agentProviderId: string): Provider | null {
  return (
    providerIds.find((id) => AGENT_PROVIDERS[id].includes(agentProviderId)) ??
    null
  );
}

/**
 * The mark of the first of `providerIds` that bb lists. An id-only record
 * draws only frontend registrations, so the mark reads bb's provider
 * directory for the logo. When bb lists none, it draws a monogram of `label`.
 * Decorative: the caller's accessible label names the provider.
 */
export function AgentMark({
  providerIds: candidates,
  label,
  className,
}: {
  providerIds: readonly string[];
  label: string;
  className?: string;
}) {
  const { providers } = useProviders();
  const entry = candidates
    .map((id) => providers.find((candidate) => candidate.id === id))
    .find((candidate) => candidate !== undefined);
  if (entry) {
    return (
      <ProviderIcon
        providerKind="agent"
        provider={entry}
        aria-hidden
        className={cn("size-5 shrink-0", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-[3px] bg-muted text-[10px] font-semibold text-foreground",
        className,
      )}
    >
      {label.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function ProviderMark({
  provider,
  className,
}: {
  provider: Provider;
  className?: string;
}) {
  return (
    <AgentMark
      providerIds={AGENT_PROVIDERS[provider]}
      label={providerDefinitions[provider].name}
      {...(className === undefined ? {} : { className })}
    />
  );
}

/** Icon toggles that pick one quota provider. */
export function ProviderSwitcher({
  value,
  onChange,
  vertical = false,
}: {
  value: Provider;
  onChange(this: void, provider: Provider): void;
  vertical?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Usage provider"
      className={cn("flex gap-1", vertical && "sm:flex-col")}
    >
      {providerIds.map((id) => {
        const selected = id === value;
        return (
          <button
            key={id}
            type="button"
            aria-label={providerDefinitions[id].name}
            aria-pressed={selected}
            title={providerDefinitions[id].name}
            onClick={() => onChange(id)}
            className={cn(
              "flex size-10 items-center justify-center rounded-md border border-transparent text-muted-foreground hover:bg-state-hover",
              selected && "border-border bg-state-active text-foreground",
            )}
          >
            <ProviderMark provider={id} />
          </button>
        );
      })}
    </div>
  );
}
