# Conductor core

Host-neutral Conductor code. Host adapters (`paseo/conductor`, later
`bb/conductor`) receive a generated copy through `scripts/sync-core.mjs`. The
sync places each `src/` module by runtime: Node-free modules go to the host's
shared directory, the rest to its server directory (Paseo: `shared/` and
`server/core/`). It rewrites imports to match.

| Path                      | Responsibility                                                  |
| ------------------------- | --------------------------------------------------------------- |
| `src/agents/`             | Agent models, snapshots, request answers, turns, and archiving. |
| `src/symphonies/`         | Score models, orchestration, execution, profiles, and storage.  |
| `src/harnesses/`          | Harness session log readers for per-attempt token usage.        |
| `src/files.ts`, `home.ts` | Atomic files and the data directory (`$CONDUCTOR_HOME`).        |
| `src/commands/`           | The task-agent command server and its MCP and launcher sources. |
| `tests/`                  | Unit tests with temporary files and fake hosts.                 |

Rules:

- Put all logic in `src/`. The core has no entrypoints: adapters own them and
  start the command server.
- Keep client contracts Node-free. A contract that reaches Node lands in the
  adapter's server directory, and the adapter's `bundle-boundaries` test fails.
- Do not import a host SDK. Domain code reaches a host through the
  `host.ts` ports. ESLint enforces this.
- Keep the RPC transport in the adapter. The core exports schemas; an adapter
  wraps them (Paseo: `defineRpc` in `shared/**/*rpc.ts`).
- After a change, run `npm run check` here, then
  `node scripts/sync-core.mjs conductor <host>` from the repository root.

## Data directory

Every host stores Conductor data in `$CONDUCTOR_HOME` (default `~/.conductor`).
`adoptLegacyHome(target, legacy)` moves a host's earlier directory there once.
It leaves a symlink at the old path, so running task agents keep reaching their
command launcher. If the move fails, Conductor keeps the legacy directory.
