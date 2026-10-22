# Essentials for bb

Experimental. Essentials adds subscription limits, token history, workspace
usage, coding CLI maintenance, and context-window reminders to bb. This
adapter runs the Essentials core from `packages/essentials` on the bb plugin
SDK. [PARITY.md](../../PARITY.md) lists what it supports. The
[Paseo README](../../paseo/essentials/README.md) describes each feature, the
provider logins, and the data sources in detail.

## Use

- **Provider usage.** A thread-header button shows the selected provider's
  remaining quota. Its popover shows the ChatGPT/Codex, Claude, or OpenCode Go
  quota windows, credits, and banked Codex resets.
- **Workspace usage.** A second thread-header button summarizes token usage
  for the thread's environment over 7 or 30 days, by model and session.
- **Usage history.** **Usage history** in the thread's right panel shows
  daily charts and breakdowns for the environment or the whole host. The
  **Essentials** page in the navigation rail shows host-wide history.
- **Harnesses.** The **Essentials** page's Harnesses tab compares installed
  and latest Codex, Claude Code, OpenCode, and Pi versions. It updates
  recognized installations and lists the models bb offers for each CLI.
- **Context Reminder.** After each turn of a top-level thread, Essentials
  reads the thread's context-window fill. At or above **Warn at**, a pill
  above the composer shows the fill. When a reminder comes due, the pill
  becomes a card with **Compact now**, **Snooze**, and **Dismiss**. Choose
  **Preview Context Reminder** in the composer's `+` menu to preview a card.

## How it maps to bb

| Essentials (Paseo)           | bb                                                    |
| ---------------------------- | ----------------------------------------------------- |
| Workspace                    | Environment                                           |
| Agent                        | Thread                                                |
| Workspace header button      | Thread header action                                  |
| Usage history panel          | Thread panel action and the Essentials page           |
| Harnesses screen             | The Essentials page's Harnesses tab                   |
| Provider model discovery     | `bb.sdk.providers.models`                             |
| `agent.turn_ended`           | `thread.idle` event, then `bb.sdk.threads.context`    |
| Timeline reminder card, pill | Composer banner                                       |
| `/compact`                   | `bb.sdk.threads.compact`                              |
| Context Reminder screen      | bb's settings form for the plugin                     |
| `/context-reminder demo`     | **Preview Context Reminder** in the composer `+` menu |
| Provider `claude`            | Provider `claude-code`                                |

- **Workspace attribution.** bb reports a provider session ID with each
  context reading. After each turn, Essentials saves the link from the
  thread's environment to that session. When history loads, it also reads
  the environment's threads, archived ones included. A session that a thread
  cleared before Essentials saw it stays out of workspace scope. It still
  counts toward the host.
- **Context Reminder.** Child threads (subagents and task threads) get no
  reminder. Turn counts, snoozes, and pending reminders live in server
  memory, so a bb restart clears them. A missing window size assumes a
  1M-token window. The reminder appears only in the thread composer.
- **CLI maintenance.** bb has no per-provider command settings, so each CLI
  resolves from the bb server's `PATH`. **Refresh models** refreshes the
  OpenCode and Pi CLI caches and then reads bb's model catalog.

## Settings

The plugin's settings page in bb holds the Context Reminder settings: Show
Context Reminder, Warn at, Ask to compact at, Remind every, Snooze for, and
Assistant. The defaults match Paseo's.

## Data directory

The history cache lives in `$ESSENTIALS_HOME/provider-usage` (default
`~/.essentials/provider-usage`). Paseo uses the same cache, because both hosts
derive it from the same local session records. bb's workspace session links
live in `$ESSENTIALS_HOME/bb`, apart from Paseo's: each host rewrites its link
file from memory.

## Limits

- Quota, history, and CLI maintenance run on the bb server's machine, with
  that machine's provider logins and session records.
- bb shows no reminder card in the timeline, because only provider plugins
  own timeline items.

## Core

The core is the `essentials` package in `packages/essentials/`. Edit it there,
never here. npm links it as a symlink, so core edits are live.

A bb Git install deletes `.npmrc` and runs `npm install` in this directory
only. bb's bundler resolves each core import from the core's real path, where
no `zod` is installed. The `zod` entry in `packages/essentials/tsconfig.json`
`paths` falls back to this adapter's `node_modules/zod`.

Adapter code lives in `server.ts`, `server/engine/bb/`,
`server/entrypoints/`, `app.tsx`, `client/`, `shared/`, and `tests/`. The app
bundle imports only Node-free core modules. `tests/bb-bundle.test.ts` checks
that rule.

## Install

`.bb/plugins.json` at the repository root names this plugin `essentials`:

```bash
bb plugin install git:<repo-url>@main --plugin essentials
bb plugin install path:/absolute/path/to/agent-plugins --plugin essentials
```

## Development

```bash
npm install
npm run check        # typecheck, lint, format, tests
bb plugin build      # bundles dist/server.js
bb plugin install .  # loads this directory into the running bb
```

The tests use bb's fake plugin host and temporary directories for every
provider record. They need no running bb and no provider credentials.

`tsconfig.json` checks the server under strict options. `tsconfig.app.json`
checks `app.tsx`, `client/` and the vendored `components/`, `lib/` and
`hooks/`. The vendored registry source does not compile under
`exactOptionalPropertyTypes`, so the app config turns it off. Lint and
Prettier skip the vendored folders. Add a registry component with
`npx shadcn add @bb/<name>` (see `components.json`).
