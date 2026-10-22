import { useState } from "react";
import { providerDefinitions, type Provider } from "essentials/providers";
import type { Usage } from "essentials/usage";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ICONS } from "../../shared/icons";
import { ProviderMark } from "./provider-mark";

function describe(name: string, issue: Usage["issue"]): string {
  if (issue === "sign-in") {
    return "Sign in to this provider's CLI on the bb host to see your remaining quota.";
  }
  if (issue === "rate-limit") {
    return `${name} is limiting usage checks. Try again in a few minutes.`;
  }
  return "We couldn’t retrieve your remaining quota. Try again shortly.";
}

/** Sign-in, rate-limit, and generic unavailable states with retry and details. */
export function UsageUnavailable({
  provider,
  issue,
  message,
  refreshing,
  onRetry,
}: {
  provider: Provider;
  issue: Usage["issue"];
  message: string;
  refreshing: boolean;
  onRetry(this: void): void;
}) {
  const [expanded, setExpanded] = useState(false);
  const name = providerDefinitions[provider].name;
  const signIn = issue === "sign-in";
  const retryLabel = signIn ? "Check connection" : "Try again";
  return (
    <div className="space-y-2">
      <div className="space-y-4 rounded-lg bg-muted/50 p-4">
        <ProviderMark
          provider={provider}
          className="size-7 text-muted-foreground"
        />
        <div aria-live="polite" className="space-y-1">
          <p className="text-sm font-semibold">
            {signIn ? `Connect ${name}` : "Usage unavailable"}
          </p>
          <p className="text-sm text-muted-foreground">
            {describe(name, issue)}
          </p>
        </div>
        <Button size="sm" disabled={refreshing} onClick={onRetry}>
          <Icon name={ICONS.refresh} aria-hidden />
          {refreshing ? "Checking…" : retryLabel}
        </Button>
      </div>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Icon
          name={expanded ? "ChevronDown" : "ChevronRight"}
          aria-hidden
          className="size-3.5"
        />
        {signIn ? "Connection details" : "Details"}
      </button>
      {expanded && (
        <p className="select-text px-1 text-xs text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}
