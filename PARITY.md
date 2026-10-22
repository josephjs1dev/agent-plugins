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

| Capability                                                   | Core         | Paseo                                                          | bb                                                |
| ------------------------------------------------------------ | ------------ | -------------------------------------------------------------- | ------------------------------------------------- |
| Data in `$CONDUCTOR_HOME` (default `~/.conductor`)           | done         | done: symphonies in `paseo/`, shared profiles                  | done: symphonies in `bb/`, shared profiles        |
| Legacy data directory adoption                               | done         | done: `$PASEO_HOME/plugin-data/conductor`                      | n/a                                               |
| Agent directory and snapshots                                | done         | done                                                           | done: threads; model read on inspection only      |
| Answer questions and permission requests                     | done         | done                                                           | done: bb approvals and questions                  |
| Guarded agent archiving                                      | done         | done                                                           | done                                              |
| Turn outcomes and recent actions                             | done         | done: `paseo/conductor/server/entrypoints/agents-events.ts`    | done: `bb/conductor/server/entrypoints/podium.ts` |
| Reminders and snooze                                         | done         | done                                                           | done                                              |
| Symphony orchestration, execution, and recovery              | done         | done                                                           | partial: local environments only                  |
| Scope admission (checkout realpath, symlinks)                | done         | done                                                           | done                                              |
| Agent profiles (read, merge, write)                          | done         | done                                                           | done: shared store, translated IDs                |
| Per-attempt token usage (Claude, Codex, OpenCode, Pi)        | done         | done                                                           | planned: bb exposes no session ID                 |
| Task-agent commands                                          | done         | done: command server, MCP, and launcher                        | done: native `conductor_*` tools                  |
| Turn-end and archive interruption                            | n/a          | done: `paseo/conductor/server/entrypoints/symphonies-hooks.ts` | done: `bb/conductor/server/entrypoints/events.ts` |
| RPC transport                                                | schemas only | done: `defineRpc` in `paseo/conductor/shared/**/*rpc.ts`       | done: `bb.rpc` in `server/entrypoints/podium.ts`  |
| Orchestrate skill install                                    | n/a          | done: `paseo/conductor/server/skills/`                         | done: manifest `skills/`                          |
| Podium UI (Agents, Symphonies, score graph, profiles editor) | n/a          | done: `paseo/conductor/client/`                                | done: `bb/conductor/client/`                      |
| Profile import and sync with host profiles                   | n/a          | done                                                           | n/a: bb has no host profiles                      |
| Composer pills for ongoing symphonies                        | n/a          | done: `paseo/conductor/client/symphonies/pills.ts`             | planned                                           |

The core holds the Podium's view logic in `packages/conductor/podium/`. Each
adapter renders it with its host's UI: React Native in Paseo, React DOM with
bb's vendored components in bb.

### Validation

| Check                      | Core | Paseo                            | bb                              |
| -------------------------- | ---- | -------------------------------- | ------------------------------- |
| Unit tests                 | done | done                             | done: fake-host tests           |
| Browser tests (Playwright) | n/a  | done                             | planned                         |
| Host smoke tests           | n/a  | done: `test:host`, `test:client` | planned: `bb plugin build` only |

## Essentials

### Capabilities

| Capability                                           | Core             | Paseo                                      | bb                                                      |
| ---------------------------------------------------- | ---------------- | ------------------------------------------ | ------------------------------------------------------- |
| Data in `$ESSENTIALS_HOME` (default `~/.essentials`) | done             | done: shared history cache                 | done: shared history cache, session links in `bb/`      |
| Legacy data directory adoption                       | done             | done: `$PASEO_HOME/storage/provider-usage` | n/a                                                     |
| Subscription limits and Codex banked resets          | done             | done: workspace header button              | done: thread header button, Essentials page             |
| Token history (host scope)                           | done             | done: usage history panel                  | done: Essentials page, thread panel                     |
| Workspace usage and history                          | done: link store | done: agents' persisted sessions           | partial: threads' context readings, see below           |
| CLI versions and updates                             | done             | done: provider command overrides           | partial: CLIs resolve from `PATH`                       |
| Model refresh and catalog                            | done: CLI caches | done: Paseo provider discovery             | done: `bb.sdk.providers.models`                         |
| Context Reminder policy                              | done: tracker    | done: `agent.turn_ended`                   | done: `thread.idle` and `threads.context`               |
| Context Reminder display                             | n/a              | done: composer pill, timeline cards        | done: composer banner (bb has no plugin timeline items) |
| Compact now                                          | n/a              | done: sends `/compact`                     | done: `bb.sdk.threads.compact`                          |
| Context Reminder settings                            | done             | done: settings screen with previews        | done: bb's settings form                                |
| Context Reminder preview                             | done             | done: `/context-reminder demo`             | done: composer `+` menu                                 |

bb reports one provider session per context reading. A thread links the
sessions it reported while Essentials ran, plus the session of its latest
reading when history syncs, so a session the thread cleared before then stays
unattributed.

### Validation

| Check                 | Core | Paseo | bb                    |
| --------------------- | ---- | ----- | --------------------- |
| Unit tests            | done | done  | done: fake-host tests |
| Bundle boundary tests | n/a  | done  | done: app bundle only |
