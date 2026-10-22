# Conductor host parity

This file tracks the Conductor capabilities that each host adapter supports.
Update a row when an adapter adds, changes, or drops a capability.

Status: **done**, **partial**, **planned**, or **n/a** (the host does not need it).

## Host ports

The core reaches a host only through these ports. An adapter must implement
each port before it can run the matching domain code.

| Port                | Defined in                                         | Paseo                                                        | bb                                                     |
| ------------------- | -------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------ |
| `AgentsHost`        | `packages/conductor/agents/host.ts`                | done: `paseo/conductor/server/engine/paseo/agents-host.ts`   | planned                                                |
| `SymphonyHost`      | `packages/conductor/symphonies/host.ts`            | done: `paseo/conductor/server/engine/paseo/symphony-host.ts` | done: `bb/conductor/server/engine/bb/symphony-host.ts` |
| `PaseoProfilesPort` | `packages/conductor/symphonies/profile-catalog.ts` | done: `paseo/conductor/server/engine/paseo/profiles-port.ts` | n/a: bb has no host profiles                           |

`PaseoProfilesPort` has a Paseo-specific name and record shape. bb does not
need it: Conductor profiles live in the shared store, and bb has no host
profiles to import or sync.

## Capabilities

| Capability                                                   | Core         | Paseo                                                          | bb                                                |
| ------------------------------------------------------------ | ------------ | -------------------------------------------------------------- | ------------------------------------------------- |
| Data in `$CONDUCTOR_HOME` (default `~/.conductor`)           | done         | done                                                           | done: symphonies in `bb/`, shared profiles        |
| Legacy data directory adoption                               | done         | done: `$PASEO_HOME/plugin-data/conductor`                      | n/a                                               |
| Agent directory and snapshots                                | done         | done                                                           | planned                                           |
| Answer questions and permission requests                     | done         | done                                                           | planned                                           |
| Guarded agent archiving                                      | done         | done                                                           | planned                                           |
| Turn outcomes and recent actions                             | done         | done: `paseo/conductor/server/entrypoints/agents-events.ts`    | planned                                           |
| Reminders and snooze                                         | done         | done                                                           | planned                                           |
| Symphony orchestration, execution, and recovery              | done         | done                                                           | partial: local environments only                  |
| Scope admission (checkout realpath, symlinks)                | done         | done                                                           | done                                              |
| Agent profiles (read, merge, write)                          | done         | done                                                           | partial: shared store, translated IDs, no editor  |
| Per-attempt token usage (Claude, Codex, OpenCode, Pi)        | done         | done                                                           | planned: bb exposes no session ID                 |
| Task-agent commands                                          | done         | done: command server, MCP, and launcher                        | done: native `conductor_*` tools                  |
| Turn-end and archive interruption                            | n/a          | done: `paseo/conductor/server/entrypoints/symphonies-hooks.ts` | done: `bb/conductor/server/entrypoints/events.ts` |
| RPC transport                                                | schemas only | done: `defineRpc` in `paseo/conductor/shared/**/*rpc.ts`       | planned                                           |
| `conductor-orchestrate` skill install                        | n/a          | done: `paseo/conductor/server/skills/`                         | done: manifest `skills/`                          |
| Podium UI (Agents, Symphonies, score graph, profiles editor) | n/a          | done: `paseo/conductor/client/`                                | planned: `bb conductor list` only                 |

The core has no client code. Each adapter builds its own UI on the host's
surfaces. bb must rebuild the Podium on the bb plugin SDK.

## Validation

| Check                      | Core         | Paseo                            | bb                              |
| -------------------------- | ------------ | -------------------------------- | ------------------------------- |
| Stale core copy            | n/a (source) | n/a (symlink)                    | done: `core:check`              |
| Unit tests                 | done         | done                             | done: fake-host tests           |
| Browser tests (Playwright) | n/a          | done                             | planned                         |
| Host smoke tests           | n/a          | done: `test:host`, `test:client` | planned: `bb plugin build` only |
