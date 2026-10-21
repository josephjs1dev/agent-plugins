# Essentials core

Host-neutral Essentials code. Host adapters (`paseo/essentials`) receive a generated copy through `scripts/sync-core.mjs`. The
sync places each `src/` module by runtime: Node-free modules go to the host's
shared directory, the rest to its server directory (Paseo: `shared/` and
`server/core/`). It rewrites imports to match.

| Path                                             | Responsibility                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------- |
| `src/`                                           | Zod contracts, RPC definitions, quota, cost, and history display. |
| `src/context-reminder/`                          | Reminder settings, gauge, sprite, and reminder policy.            |
| `src/collectors/`                                | Claude, Codex, OpenCode, and Pi usage and history collectors.     |
| `src/history-*.ts`                               | History scans, cache, storage files, and the history store.       |
| `src/usage-reader.ts`                            | Cached quota reads per provider.                                  |
| `src/cli-*.ts`                                   | CLI installation detection and updates.                           |
| `src/maintenance-service.ts`, `host-identity.ts` | The CLI maintenance service and host identity.                    |
| `src/codex-resetter.ts`                          | Codex banked reset preparation and redemption.                    |
| `tests/`                                         | Unit tests with temporary files and fake I/O.                     |

Rules:

- Put all logic in `src/`. The core has no entrypoints: adapters own them.
- Keep client contracts Node-free. A contract that reaches Node lands in the
  adapter's server directory, and the adapter's `bundle-boundaries` test fails.
- Do not import a host SDK. ESLint enforces this.
- Keep the RPC transport in the adapter. The core exports plain
  `<name>Definition` objects (`name`, `input`, `output`). An adapter wraps them
  (Paseo: `defineRpc` and `defineSettings` in `shared/**/*rpc.ts`).
- After a change, run `npm run check` here, then
  `node scripts/sync-core.mjs essentials <host>` from the repository root.
