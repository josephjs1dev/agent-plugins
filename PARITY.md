# Conductor host parity

This file tracks the Conductor capabilities that each host adapter supports.
Update a row when an adapter adds, changes, or drops a capability.

Status: **done**, **partial**, **planned**, or **n/a** (the host does not need it).

## Host ports

The core reaches a host only through these ports. An adapter must implement
each port before it can run the matching domain code.

| Port                | Defined in                                  | Paseo                                                        | bb      |
| ------------------- | ------------------------------------------- | ------------------------------------------------------------ | ------- |
| `AgentsHost`        | `shared/agents/host.ts`                     | done: `paseo/conductor/server/engine/paseo/agents-host.ts`   | planned |
| `SymphonyHost`      | `shared/symphonies/host.ts`                 | done: `paseo/conductor/server/engine/paseo/symphony-host.ts` | planned |
| `PaseoProfilesPort` | `server/core/symphonies/profile-catalog.ts` | done: `paseo/conductor/server/engine/paseo/profiles-port.ts` | planned |

`PaseoProfilesPort` has a Paseo-specific name and record shape. Rename or
generalize it in the core before bb implements it.

## Capabilities

| Capability                                                   | Core         | Paseo                                                          | bb      |
| ------------------------------------------------------------ | ------------ | -------------------------------------------------------------- | ------- |
| Data in `$CONDUCTOR_HOME` (default `~/.conductor`)           | done         | done                                                           | planned |
| Legacy data directory adoption                               | done         | done: `$PASEO_HOME/plugin-data/conductor`                      | n/a     |
| Agent directory and snapshots                                | done         | done                                                           | planned |
| Answer questions and permission requests                     | done         | done                                                           | planned |
| Guarded agent archiving                                      | done         | done                                                           | planned |
| Turn outcomes and recent actions                             | done         | done: `paseo/conductor/server/entrypoints/agents-events.ts`    | planned |
| Reminders and snooze                                         | done         | done                                                           | planned |
| Symphony orchestration, execution, and recovery              | done         | done                                                           | planned |
| Scope admission (checkout realpath, symlinks)                | done         | done                                                           | planned |
| Agent profiles (read, merge, write)                          | done         | done                                                           | planned |
| Per-attempt token usage (Claude, Codex, OpenCode, Pi)        | done         | done                                                           | planned |
| Task-agent command server, MCP, and launcher                 | done         | done                                                           | planned |
| Command hooks for task agents                                | n/a          | done: `paseo/conductor/server/entrypoints/symphonies-hooks.ts` | planned |
| RPC transport                                                | schemas only | done: `defineRpc` in `paseo/conductor/shared/**/*rpc.ts`       | planned |
| `conductor-orchestrate` skill install                        | n/a          | done: `paseo/conductor/server/skills/`                         | planned |
| Podium UI (Agents, Symphonies, score graph, profiles editor) | n/a          | done: `paseo/conductor/client/`                                | planned |

The core has no client code. Each adapter builds its own UI on the host's
surfaces. bb must rebuild the Podium on the bb plugin SDK.

## Validation

| Check                            | Core         | Paseo                            | bb      |
| -------------------------------- | ------------ | -------------------------------- | ------- |
| Core drift (`sync-core --check`) | n/a (source) | n/a (source)                     | planned |
| Unit tests                       | done         | done                             | planned |
| Browser tests (Playwright)       | n/a          | done                             | planned |
| Host smoke tests                 | n/a          | done: `test:host`, `test:client` | planned |
