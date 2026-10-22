# Conductor for bb

Experimental. Conductor turns an approved plan into a symphony of bb task
threads. It dispatches the threads and follows their reports to completion.
This adapter runs the Conductor core from `packages/conductor` on the bb plugin SDK.
It has no Podium UI yet. [PARITY.md](../../PARITY.md) lists what it supports.

## Use

Ask a thread to orchestrate a plan. The thread calls `conductor_orchestrate`
and becomes the symphony's Conductor agent. It then defines tasks, dispatches
them, and finishes the symphony. Each task agent is a child thread in the
Conductor's environment. The `conductor-orchestrate` skill guides the thread.

- `bb conductor list` lists the stored symphonies. Add `--json` for JSON output.
- `conductor_get` (from the Conductor or a task thread) shows one symphony.

## How it maps to bb

| Conductor                   | bb                                                      |
| --------------------------- | ------------------------------------------------------- |
| Agent                       | Thread                                                  |
| Concert                     | Environment                                             |
| Task agent                  | Child thread in the same environment                    |
| Agent commands (Paseo: MCP) | Native tools `conductor_<command>`                      |
| Provider `claude`           | Provider `claude-code`                                  |
| Permission mode             | `permissionMode`: `accept-edits`, `auto` or `full`      |
| Thinking option             | `reasoningLevel`                                        |
| Turn ended, agent archived  | `thread.idle`, `thread.failed`, `thread.archived` event |

- **Agent IDs.** Conductor chooses a task agent's ID before launch, but bb assigns
  thread IDs. The plugin's key-value store maps one to the other. Each task
  thread also carries its agent ID in plugin metadata, so a lost mapping can be
  recovered. A tool call's identity is the calling thread, which bb verifies.
- **Profile IDs.** The shared profile store uses Paseo's provider and mode IDs.
  `server/engine/bb/vocabulary.ts` translates them at the host port, so a
  profile edited in Paseo works in bb. `bypassPermissions` and `full-access`
  become `full`, `auto-review` becomes `auto`, and `default` becomes
  `accept-edits`. A mode without a bb equivalent, such as `plan`, rejects the
  launch.
- **Permissions.** A task thread gets its profile's mode, else its Conductor
  thread's mode, else `accept-edits`. It never falls back to the project
  default, and it never gets a broader mode than its Conductor thread.
- **Sends.** bb does not deduplicate sends, so the plugin records each wake
  message ID and skips a repeat.
- **Reconciliation.** A background service reconciles symphonies every 5
  seconds.

## Limits

- Placement and change tracking run git on the bb server's machine. A symphony
  can only use an environment on that machine.
- Token usage per attempt is not recorded, because bb does not expose provider
  session IDs.
- bb has no profile editor. Edit the shared profile store in Paseo's Podium.
- Pending permission requests are not visible to Conductor.

## Data directory

Symphonies live in `$CONDUCTOR_HOME/bb` (default `~/.conductor/bb`). The
directory is separate from Paseo's symphonies, because each host's reconciler
would treat the other host's agents as missing. The worker profile store,
`$CONDUCTOR_HOME/profiles.json`, is shared with Paseo.

## Core

The core is the `conductor` package in `packages/conductor/`. Edit it there,
never here. npm links it as a symlink, so core edits are live.

A bb Git install deletes `.npmrc` and runs `npm install` in this directory
only. bb's bundler resolves each core import from the core's real path, where
no `zod` is installed. The `zod` entry in `packages/conductor/tsconfig.json`
`paths` falls back to this adapter's `node_modules/zod`.

Adapter code lives in `server.ts`,
`server/engine/bb/`, `server/entrypoints/`, `skills/`, and `tests/`.

## Install

`.bb/plugins.json` at the repository root names this plugin `conductor`:

```bash
bb plugin install git:<repo-url>@main --plugin conductor
bb plugin install path:/absolute/path/to/agent-plugins --plugin conductor
```

## Development

```bash
npm install
npm run check        # typecheck, lint, format, tests
bb plugin build      # bundles dist/server.js
bb plugin install .  # loads this directory into the running bb
```

The tests use bb's fake plugin host and a temporary git checkout. They need no
running bb.
