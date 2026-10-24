import { z } from "zod";

interface ProviderDefinition {
  name: string;
  icon: string;
  /**
   * Model providers, as Pi and OpenCode name them in `<provider>/<model>`
   * IDs, that bill this subscription.
   */
  modelProviders: readonly string[];
}

export const providerDefinitions = {
  chatgpt: {
    name: "ChatGPT",
    icon: "Gauge",
    modelProviders: ["openai-codex"],
  },
  "opencode-go": {
    name: "OpenCode Go",
    icon: "ChartNoAxesCombined",
    modelProviders: ["opencode-go"],
  },
  claude: {
    name: "Claude",
    icon: "Sparkles",
    modelProviders: ["anthropic"],
  },
} as const satisfies Record<string, ProviderDefinition>;

export type Provider = keyof typeof providerDefinitions;

// This object is defined locally, so its own keys are exactly the provider IDs.
export const providerIds = Object.keys(providerDefinitions) as Provider[];
export const providerSchema = z.enum(providerIds);

/** The quota provider behind a model provider ID such as `opencode-go`. */
export function providerOfModelProvider(
  modelProvider: string,
): Provider | undefined {
  return providerIds.find((id) => {
    const modelProviders: readonly string[] =
      providerDefinitions[id].modelProviders;

    return modelProviders.includes(modelProvider);
  });
}

/**
 * The quota provider behind a `<provider>/<model>` ID such as
 * `opencode-go/gpt-6-luna`, or undefined for a model ID without one.
 */
export function providerOfModel(model: string): Provider | undefined {
  const separator = model.indexOf("/");

  return separator > 0
    ? providerOfModelProvider(model.slice(0, separator))
    : undefined;
}
