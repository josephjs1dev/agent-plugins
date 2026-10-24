# Essentials for bb

Experimental. Essentials adds subscription limits, token history, and
context-window reminders to bb. This adapter runs the Essentials core from `packages/essentials` on the bb plugin
SDK. [PARITY.md](../../PARITY.md) lists what it supports. The
[Paseo README](../../paseo/essentials/README.md) describes each feature, the
provider logins, and the data sources in detail.

## Use

- **Provider usage.** A thread-header button shows the remaining quota of the
  subscription behind the thread's model or provider. A model ID names its
  subscription first: OpenCode Go for `opencode-go/…`, ChatGPT for
  `openai-codex/…`, and Claude for `anthropic/…`, as Pi and OpenCode report
  them. Otherwise the provider
  picks it: ChatGPT for Codex, Claude for Claude Code, and OpenCode Go for
  OpenCode (`acp-opencode`). Other providers show ChatGPT. Its
  popover shows the quota windows, credits, and banked Codex resets, and can
  switch to another subscription until the thread's provider changes.
- **Usage history.** The **Usage history** page in the navigation rail, and
  **Usage history** in the thread's right panel, show daily charts and
  breakdowns of every session on the host over 7 or 30 days, including Pi
  threads, whose sessions bb keeps in `pi-bridge-sessions` under its data
  directory.
- **Context Reminder.** After each turn of a top-level thread, Essentials
  reads the thread's context-window fill. When a reminder comes due, a card
  above the composer offers **Compact now**, **Snooze**, and **Dismiss**. Dismiss
  hides the card until **Remind every** turns pass; a rise to **Ask to compact
  at** shows it sooner. While a thread is snoozed, Snooze is greyed out and
  shows when reminders resume. A thread-header button shows the fill once the
  thread has a reading and opens the same card in a popover. Choose
  **Preview Context Reminder** in the composer's `+` menu to preview a card.
  The **Context Reminder** page in the navigation rail holds its settings.
- **Child-thread cleanup.** A thread that has child threads gets **Clean up
  child threads** in its thread menu. **Archive idle child threads** and
  **Delete idle child threads** list the targets and ask for confirmation.

## How it maps to bb

| Essentials (Paseo)           | bb                                                    |
| ---------------------------- | ----------------------------------------------------- |
| Workspace                    | None: history is host-wide                            |
| Agent                        | Thread                                                |
| Workspace header button      | Thread header action                                  |
| Usage history panel          | Thread panel action and the Usage history page        |
| `agent.turn_ended`           | `thread.idle` event, then `bb.sdk.threads.context`    |
| Timeline reminder card, pill | Composer banner card and thread header button         |
| `/compact`                   | `bb.sdk.threads.compact`                              |
| Context Reminder screen      | The Context Reminder page and bb's settings form      |
| `/context-reminder demo`     | **Preview Context Reminder** in the composer `+` menu |
| Provider `claude`            | Provider `claude-code`                                |
| Archive or delete subagents  | Thread menu: **Clean up child threads**               |

- **No workspace scope.** bb has threads, not workspaces, so this adapter
  leaves out Paseo's workspace usage and always reads host-wide history. The
  core's workspace totals come back empty.
- **Context Reminder.** Child threads (subagents and task threads) get no
  reminder. Turn counts, snoozes, and pending reminders live in server
  memory, so a bb restart clears them. A missing window size assumes a
  1M-token window. The reminder appears only in the thread composer.
- **Child-thread cleanup.** Essentials reads every thread below the selected
  thread, archived and hidden ones included. A thread is idle when its status
  is `idle` and it has no background work, queued message, or open question.
  An error status counts as busy. Only visible idle threads with no busy
  thread below them are targets. Archive skips archived threads. Delete
  includes them. bb archives and deletes a thread together with the threads
  whose lifecycle it owns, so Essentials acts deepest first, one thread at a
  time. When you confirm, Essentials checks the tree again. A thread that
  started work since the check stays. When a thread fails, every thread above
  it stays. One cleanup reads at most 500 threads.
- **CLI maintenance.** bb updates its harnesses and lists their models
  itself, so this adapter leaves out Paseo's Harnesses screen.

## Settings

The **Context Reminder** page in the navigation rail and the plugin's settings
page in bb hold the same Context Reminder settings: Show Context Reminder,
Warn at, Ask to compact at, Remind every, Snooze for, and Assistant. The page
saves each change at once. The defaults match Paseo's.

## Data directory

The history cache lives in `$ESSENTIALS_HOME/provider-usage` (default
`~/.essentials/provider-usage`). Paseo uses the same cache, because both hosts
derive it from the same local session records.

## Limits

- Quota and history run on the bb server's machine, with
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
