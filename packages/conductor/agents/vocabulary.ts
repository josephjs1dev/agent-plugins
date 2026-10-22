import type { SymphonyHost } from "../symphonies/host";
import { LaunchRejectedError } from "../symphonies/errors";

/**
 * The profile store and the core use one provider and permission-mode
 * vocabulary: Paseo's IDs, such as `claude`, `codex`, `auto-review` and
 * `bypassPermissions`. A host with other IDs translates at its boundary, so one
 * `profiles.json` serves every host. Paseo's own IDs need no translation.
 */
export interface HostVocabulary {
  /** Host provider ID for a core provider ID. */
  providerToHost(provider: string): string;
  /** Core provider ID for a host provider ID. */
  providerFromHost(provider: string): string;
  /** Host mode for a core mode, or null when the host has no equivalent. */
  modeToHost(modeId: string): string | null;
  /** Core mode for a host mode. */
  modeFromHost(modeId: string): string;
}

export interface VocabularyTable {
  /** Core provider ID → host provider ID. Unlisted IDs pass through. */
  providers: Readonly<Record<string, string>>;
  /** Normalized core mode (`bypass-permissions`) → host mode. Unlisted modes have no equivalent. */
  modesToHost: Readonly<Record<string, string>>;
  /** Host mode → core mode. Unlisted modes pass through. */
  modesFromHost: Readonly<Record<string, string>>;
}

/** `bypassPermissions`, `bypass_permissions` and `bypass-permissions` compare equal. */
export function normalizeMode(modeId: string): string {
  return modeId
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replaceAll("_", "-")
    .toLowerCase();
}

export function hostVocabulary(table: VocabularyTable): HostVocabulary {
  const fromHost = new Map(
    Object.entries(table.providers).map(([core, host]) => [host, core]),
  );
  return {
    providerToHost: (provider) => table.providers[provider] ?? provider,
    providerFromHost: (provider) => fromHost.get(provider) ?? provider,
    modeToHost: (modeId) => table.modesToHost[normalizeMode(modeId)] ?? null,
    modeFromHost: (modeId) => table.modesFromHost[modeId] ?? modeId,
  };
}

function hostSelection(selection: string, vocabulary: HostVocabulary): string {
  const separator = selection.indexOf("/");
  return separator === -1
    ? vocabulary.providerToHost(selection)
    : `${vocabulary.providerToHost(selection.slice(0, separator))}${selection.slice(separator)}`;
}

/** Wraps a host port so the core sees only the store's vocabulary. */
export function translatedHost(
  host: SymphonyHost,
  vocabulary: HostVocabulary,
): SymphonyHost {
  return {
    ...host,
    async agent(agentId) {
      const agent = await host.agent(agentId);
      return agent
        ? {
            ...agent,
            provider: vocabulary.providerFromHost(agent.provider),
            modeId:
              agent.modeId === null
                ? null
                : vocabulary.modeFromHost(agent.modeId),
          }
        : null;
    },
    async providers() {
      return (await host.providers()).map((entry) => ({
        ...entry,
        provider: vocabulary.providerFromHost(entry.provider),
      }));
    },
    models: (provider, cwd) =>
      host.models(vocabulary.providerToHost(provider), cwd),
    async createAgent(input) {
      const { modeId, ...config } = input.config;
      let hostMode: string | null = null;
      if (modeId !== undefined) {
        hostMode = vocabulary.modeToHost(modeId);
        if (hostMode === null) {
          throw new LaunchRejectedError(
            `This host has no permission mode equivalent to ${modeId}.`,
          );
        }
      }
      await host.createAgent({
        ...input,
        config: {
          ...config,
          provider: hostSelection(config.provider, vocabulary),
          ...(hostMode === null ? {} : { modeId: hostMode }),
        },
      });
    },
  };
}
