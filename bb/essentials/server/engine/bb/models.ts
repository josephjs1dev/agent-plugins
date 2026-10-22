import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { CliId } from "essentials/cli-maintenance";
import { bbProviderOf } from "../../../shared/providers";

type Sdk = BbPluginApi["sdk"];

const MAX_MODELS = 2000;

export interface Model {
  id: string;
  label: string;
  description: string;
}

const LOAD_ERRORS: Record<string, string> = {
  auth_required: "Sign in to this provider in bb to list its models.",
  missing_executable: "bb cannot find this provider's CLI.",
  provider_unavailable: "This provider is unavailable in bb.",
};

/** The models bb offers for a CLI's provider. */
export async function providerModels(
  sdk: Sdk,
  id: CliId,
  signal?: AbortSignal,
): Promise<{ models: Model[]; error: string }> {
  const providerId = bbProviderOf(id);
  const options = await sdk.providers.models({
    providerId,
    ...(signal ? { signal } : {}),
  });
  const models = options.models.slice(0, MAX_MODELS).map((model) => ({
    id: model.model.slice(0, 400),
    label: (model.displayName || model.model).slice(0, 400),
    description: model.description.slice(0, 2000),
  }));
  const code = options.modelLoadError?.code;
  return {
    models,
    error: code ? (LOAD_ERRORS[code] ?? "Model discovery failed.") : "",
  };
}
