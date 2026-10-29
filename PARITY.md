# Host parity

This file tracks the capabilities that each host adapter supports, for
Conductor and for Essentials. Update a row when an adapter adds, changes, or
drops a capability.

Status: **done**, **partial**, **planned**, or **n/a** (the host does not need it).

## Conductor

### Host ports

The core reaches a host only through these ports. An adapter must implement
each port before it can run the matching domain code.

| Port                | Defined in                                         | Paseo                                                        | bb                                                     |
| ------------------- | -------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------ |
| `AgentsHost`        | `packages/conductor/agents/host.ts`                | done: `paseo/conductor/server/engine/paseo/agents-host.ts`   | done: `bb/conductor/server/engine/bb/agents-host.ts`   |
| `SymphonyHost`      | `packages/conductor/symphonies/host.ts`            | done: `paseo/conductor/server/engine/paseo/symphony-host.ts` | done: `bb/conductor/server/engine/bb/symphony-host.ts` |
| `PaseoProfilesPort` | `packages/conductor/symphonies/profile-catalog.ts` | done: `paseo/conductor/server/engine/paseo/profiles-port.ts` | n/a: bb has no host profiles                           |

`PaseoProfilesPort` has a Paseo-specific name and record shape. bb does not
need it: Conductor profiles live in the shared store, and bb has no host
profiles to import or sync.

### Capabilities

| Capability                                                   | Paseo                                                          | bb                                                |
| ------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------- |
| Data in `$CONDUCTOR_HOME` (default `~/.conductor`)           | done: symphonies in `paseo/`, shared profiles                  | done: symphonies in `bb/`, shared profiles        |
| Legacy data directory adoption                               | done: `$PASEO_HOME/plugin-data/conductor`                      | n/a                                               |
| Agent directory and snapshots                                | done                                                           | done: threads; model read on inspection only      |
| Answer questions and permission requests                     | done                                                           | done: bb approvals and questions                  |
| Guarded agent archiving                                      | done                                                           | done                                              |
| Turn outcomes and recent actions                             | done: `paseo/conductor/server/entrypoints/agents-events.ts`    | done: `bb/conductor/server/entrypoints/podium.ts` |
| Reminders and snooze                                         | done                                                           | done                                              |
| Symphony orchestration, execution, and recovery              | done                                                           | partial: local environments only                  |
| Scope admission (checkout realpath, symlinks)                | done                                                           | done                                              |
| Agent profiles (read, merge, write)                          | done                                                           | done: shared store, translated IDs                |
| Per-attempt token usage (Claude, Codex, OpenCode, Pi)        | done                                                           | planned: bb exposes no session ID                 |
| Task-agent commands                                          | done: command server, MCP, and launcher                        | done: native `conductor_*` tools                  |
| Turn-end and archive interruption                            | done: `paseo/conductor/server/entrypoints/symphonies-hooks.ts` | done: `bb/conductor/server/entrypoints/events.ts` |
| RPC transport                                                | done: `defineRpc` in `paseo/conductor/shared/**/*rpc.ts`       | done: `bb.rpc` in `server/entrypoints/podium.ts`  |
| Orchestrate skill install                                    | done: `paseo/conductor/server/skills/`                         | done: manifest `skills/`                          |
| Podium UI (Agents, Symphonies, score graph, profiles editor) | done: `paseo/conductor/client/`                                | done: `bb/conductor/client/`                      |
| Profile import and sync with host profiles                   | done                                                           | n/a: bb has no host profiles                      |
| Composer pills for ongoing symphonies                        | done: `paseo/conductor/client/symphonies/pills.ts`             | done: thread header pill                          |

The core holds the Podium's view logic in `packages/conductor/podium/`. Each
adapter renders it with its host's UI: React Native in Paseo, React DOM with
bb's vendored components in bb.

### Validation

| Check                      | Paseo                            | bb                              |
| -------------------------- | -------------------------------- | ------------------------------- |
| Unit tests                 | done                             | done: fake-host tests           |
| Browser tests (Playwright) | done                             | planned                         |
| Host smoke tests           | done: `test:host`, `test:client` | planned: `bb plugin build` only |

## Essentials

### Capabilities

| Capability                                           | Paseo                                      | bb                                                      |
| ---------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------- |
| Data in `$ESSENTIALS_HOME` (default `~/.essentials`) | done: shared history cache                 | done: shared history cache                              |
| Legacy data directory adoption                       | done: `$PASEO_HOME/storage/provider-usage` | n/a                                                     |
| Subscription limits and Codex banked resets          | done: workspace header button              | done: thread header button follows the thread           |
| Token history (host scope)                           | done: usage history panel                  | done: Usage history page, thread panel                  |
| Workspace usage and history                          | done: agents' persisted sessions           | n/a: bb has threads, not workspaces                     |
| CLI versions and updates                             | done: provider command overrides           | n/a: bb maintains its harnesses                         |
| Model refresh and catalog                            | done: Paseo provider discovery             | n/a: bb maintains its harnesses                         |
| Context Reminder policy                              | done: `agent.turn_ended`                   | done: `thread.idle` and `threads.context`               |
| Context Reminder display                             | done: composer pill, timeline cards        | done: composer banner (bb has no plugin timeline items) |
| Compact now                                          | done: sends `/compact`                     | done: `bb.sdk.threads.compact`                          |
| Context Reminder settings                            | done: settings screen with previews        | done: Context Reminder page, bb's settings form         |
| Context Reminder preview                             | done: `/context-reminder demo`             | done: composer `+` menu                                 |
| Archive or delete idle child threads                 | n/a: Paseo does it natively                | done: thread menu, adapter-only                         |
| Old-thread Cleaner and provider session deletion     | not yet                                    | done: sidebar footer, host deletes sessions             |
| Workspace file explorer, search, Git status, delete  | n/a: Paseo has a native file browser       | done: thread panel, host entry reads the checkout       |
| Explorer ignored-file filter                         | n/a: Paseo has a native file browser       | done: host asks Git, before paging                      |
| File content search                                  | n/a: Paseo has a native file browser       | done: Search panel, ripgrep on the host                 |
| Explorer and Search before a thread exists           | n/a: Paseo has a native file browser       | done: New thread panels, project's default checkout     |

Child-thread cleanup lives in the bb adapter only, because Paseo already
archives and deletes child agents natively. The Cleaner's eligibility and
session deletion live in the core (`packages/essentials/cleaner/`), so a
Paseo adapter can reuse them.

### Validation

| Check                 | Paseo | bb                    |
| --------------------- | ----- | --------------------- |
| Unit tests            | done  | done: fake-host tests |
| Bundle boundary tests | done  | done: app bundle only |
