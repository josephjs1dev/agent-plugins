import { hostVocabulary } from "conductor/agents/vocabulary";

/**
 * Translates the profile store's Paseo IDs to bb's. bb permission modes apply
 * to every provider: `accept-edits` < `auto` < `full`.
 */
export const bbVocabulary = hostVocabulary({
  providers: { claude: "claude-code" },
  modesToHost: {
    // Elevated modes.
    "bypass-permissions": "full",
    "full-access": "full",
    "danger-full-access": "full",
    full: "full",
    // Reviewed automatic approval.
    auto: "auto",
    "auto-review": "auto",
    // bb has no mode below accept-edits; a prompting default maps to it.
    "accept-edits": "accept-edits",
    default: "accept-edits",
    "workspace-write": "accept-edits",
  },
  // `full-access` is a mode the core recognizes as elevated.
  modesFromHost: { full: "full-access" },
});
