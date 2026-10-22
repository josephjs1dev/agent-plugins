import { experimental_ProviderIcon as ProviderIcon } from "@get-bb/plugin-sdk/app";
import {
  providerDefinitions,
  providerIds,
  type Provider,
} from "essentials/providers";
import { cn } from "@/lib/utils";

/** The bb agent provider whose artwork stands for each quota provider. */
const AGENT_PROVIDER: Record<Provider, string> = {
  chatgpt: "codex",
  claude: "claude-code",
  "opencode-go": "opencode",
};

export function ProviderMark({
  provider,
  className,
}: {
  provider: Provider;
  className?: string;
}) {
  return (
    <ProviderIcon
      providerKind="agent"
      provider={{ id: AGENT_PROVIDER[provider] }}
      className={cn("size-5", className)}
      aria-hidden
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
