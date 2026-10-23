import type {
  ProviderCatalog,
  ProviderEntry,
} from "conductor/symphonies/profiles-contracts";
import type { HostVocabulary } from "conductor/agents/vocabulary";
import { isKnownElevatedMode } from "conductor/symphonies/workers";
import { providerModes } from "./mapping";
import type { BbPermissionMode, BbSdk } from "./types";

const modeLabels: Record<BbPermissionMode, string> = {
  "accept-edits": "Accept edits",
  auto: "Auto",
  full: "Full access",
};

function providerStatus(
  available: boolean,
  error: string | null,
): ProviderEntry["status"] {
  if (error) {
    return "error";
  }
  return available ? "ready" : "unavailable";
}

/**
 * The provider/model/mode/thinking catalog the Podium profile editor reads,
 * in the profile store's vocabulary. A provider whose models fail to load
 * still appears, so the editor can explain why it is unavailable.
 */
export async function providerCatalog(
  sdk: BbSdk,
  vocabulary: HostVocabulary,
): Promise<ProviderCatalog> {
  const providers = await sdk.providers.list();
  const entries = await Promise.all(
    providers.slice(0, 32).map(async (provider): Promise<ProviderEntry> => {
      const loaded = await sdk.providers
        .models({ providerId: provider.id })
        .catch((error: unknown) => ({
          models: [],
          modelLoadError: { detail: String(error) },
        }));
      // The profile editor offers only the modes the provider runs.
      const supported = providerModes(provider);
      const modes = supported.map((mode) => {
        const id = vocabulary.modeFromHost(mode);
        return {
          id,
          label: modeLabels[mode],
          elevated: isKnownElevatedMode(id),
        };
      });
      const error = loaded.modelLoadError
        ? (loaded.modelLoadError.detail ?? "Models could not be loaded.")
        : null;
      return {
        id: vocabulary.providerFromHost(provider.id),
        label: provider.displayName,
        available: provider.available && !error,
        status: providerStatus(provider.available, error),
        ...(error ? { error: error.slice(0, 500) } : {}),
        defaultModeId: vocabulary.modeFromHost(supported[0] ?? "accept-edits"),
        models: loaded.models.slice(0, 200).map((model) => ({
          id: model.model,
          label: model.displayName || model.model,
          isDefault: model.isDefault,
          ...(model.defaultReasoningEffort
            ? { defaultThinkingOptionId: model.defaultReasoningEffort }
            : {}),
          thinkingOptions: model.supportedReasoningEfforts.map((effort) => ({
            id: effort.reasoningEffort,
            label: effort.reasoningEffort,
            isDefault: effort.reasoningEffort === model.defaultReasoningEffort,
          })),
        })),
        modes,
      };
    }),
  );
  return { providers: entries };
}
