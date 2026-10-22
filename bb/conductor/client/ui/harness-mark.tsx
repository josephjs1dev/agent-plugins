import {
  experimental_ProviderIcon as ProviderIcon,
  experimental_useProviders as useProviders,
} from "@get-bb/plugin-sdk/app";
import { bbVocabulary } from "../../shared/vocabulary";
import { cn } from "@/lib/utils";

/**
 * A provider's mark. The profile store names providers in Paseo's vocabulary,
 * so the mark looks up bb's provider through the adapter's translation and
 * draws bb's own artwork. A provider bb does not list gets a monogram of its
 * label's first letter. Decorative in every case: the caller's accessible
 * label names the provider.
 */
export function HarnessMark({
  provider,
  label,
  className,
}: {
  /** The profile store's provider id, e.g. "claude" or "codex". */
  provider: string;
  /** The provider's display label; the monogram uses its first letter. */
  label?: string;
  className?: string;
}) {
  const { providers } = useProviders();
  const hostId = bbVocabulary.providerToHost(provider);
  const entry = providers.find((candidate) => candidate.id === hostId);
  if (entry) {
    return (
      <ProviderIcon
        providerKind="agent"
        provider={entry}
        aria-hidden
        className={cn("size-3.5 shrink-0", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-3.5 shrink-0 items-center justify-center rounded-[3px] bg-muted text-[8px] font-semibold text-foreground",
        className,
      )}
    >
      {(label ?? provider).trim().charAt(0).toUpperCase()}
    </span>
  );
}
