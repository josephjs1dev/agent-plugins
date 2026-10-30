# Essentials for bb

Experimental. Essentials adds subscription limits, token history,
context-window reminders, a Cleaner for old threads and their provider
sessions, a workspace file explorer, and file content search to bb. This adapter runs the Essentials core from `packages/essentials` on the bb plugin
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
- **Cleaner.** The broom in the sidebar footer, or **Cleaner: review old
  threads** in the palette, opens a dialog of old threads to delete. A thread
  is old when it has no updates for **Older than** days (1 to 30, default 7).
  A dot on the broom marks old threads or a cleanup problem. Select threads,
  choose **Review deletion**, then confirm. With **Cleaner: delete provider
  sessions** on, deleting a Claude Code or Codex thread also deletes its
  native session, from Cleaner or from bb's own Delete.
- **Explorer.** Open **Explorer** from the thread's panel actions, or run
  **Explorer: browse files** in the palette (default shortcut Cmd+B, Ctrl+B
  on Windows and Linux). It lists the thread's workspace
  as an indented tree: folders first, keyboard arrow navigation, and **Load
  more** per folder. A file opens in bb's native preview. Type in **Search
  files** to search filenames and relative paths in every subfolder. The
  search icon on a folder row limits search to that folder; breadcrumbs widen
  it again. A row highlights under the pointer. The eye button hides or shows hidden files and folders (names that start with
  a dot) in the tree and in search, for every thread. The dashed-file
  button hides or shows the files and folders that Git ignores, the same
  way. A tracked file always shows.

  Before a thread exists, the New thread screen's panel launcher has
  **Explorer** and **Search** too. They read the default checkout of the
  project selected in the composer. In a thread, they read the thread's
  workspace.

  In a Git work tree, the Explorer marks changes the way an IDE does:
  **M** modified, **A** added, **U** untracked, **D** deleted, and **!**
  conflicted, with the name tinted to match. Files and folders that Git
  ignores are greyed out. A folder that holds a change shows a dot in the
  color of its most important change. The status refreshes every 10 seconds
  and on **Refresh files**.

  Right-click a file or folder, or press the Menu key or Shift+F10 on a
  focused row, for **Copy relative path** (from the workspace root), **Search
  in folder** on a folder, and **Delete
  file…** or **Delete folder…**. Delete asks first, then permanently removes the file, or the
  folder and everything in it. It does not use the Trash.

  The Explorer keeps its state per thread or project while bb runs: scope,
  search text, selected file, expanded folders, loaded pages, and scroll
  position. Opening a preview and coming back restores it.

- **Search.** Open **Search** from the panel actions, run **Search: find in
  files** in the palette (default shortcut Cmd+Shift+F, Ctrl+Shift+F on
  Windows and Linux), or press the Explorer's find button to search its
  current folder. It finds text in file contents. **Aa** matches case, **ab**
  matches whole words, and **.\*** reads the query as a regular expression.
  The filter button opens **Include** and **Exclude** fields that take
  comma-separated globs, such as `src/**/*.ts, *.{md,txt}`, and the **Search
  hidden files** and **Search ignored files** options. Results group by file.
  A file row folds its matches, and a match opens bb's preview at its line.
  Search keeps its query, options, and folder per thread or project while bb
  runs.

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
| Native file browser          | **Explorer** and **Search** panels                    |
| None                         | **Cleaner** in the sidebar footer                     |

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
- **Cleaner.** A candidate is a visible thread that is not pinned, not below
  a pinned thread, and idle or failed with no background work, queued
  message, or open question. Every thread that bb deletes with it must
  qualify too, archived and hidden ones included. Cleaner offers each thread
  in at most one candidate and shows the first 100. A review expires after 5
  minutes and works once. Before each deletion, Cleaner stops the threads and
  checks the tree and its settings again. A thread that changed stays.
- **Provider session deletion.** bb fires its deletion event before the
  runtime stops, and history reads fail after it. So, while session deletion
  is on, Cleaner records each thread's native session IDs and its
  `CLAUDE_CONFIG_DIR` or `CODEX_HOME` when the session launches and after
  each turn. A thread deleted before Cleaner recorded it keeps its provider
  data, and the dialog says so. A background pass on the thread's host waits
  until bb removes the thread's storage directory, then deletes each session:
  - Claude Code: the transcript and subagent folder in every project, plus
    the session's `tasks`, `file-history`, `session-env`, `debug`, and
    `todos` entries. Cleaner refuses symlinks.
  - Codex: `codex app-server --stdio` with a `thread/delete` request. Set
    `ESSENTIALS_CODEX_BIN`, or **Cleaner: Codex binary**, when `codex` is not
    on the host's `PATH`. Then Cleaner removes the session's local entry from
    the desktop app's sidebar catalog, `sqlite/codex-dev.db`, in one
    transaction with `python3` (`ESSENTIALS_PYTHON_BIN` overrides it). It
    refuses an unexpected schema. A running app can show the entry until it
    reopens.

  A session that another live thread references stays. Failed stages retry
  every 30 seconds, and the dialog lists what is pending. The progress lives
  in the plugin database, so it survives a restart.

- **Explorer.** The plugin's host entry (`host.ts`) reads folders on the
  host that owns the thread's environment, or the project's default
  checkout on the New thread screen. The server resolves the root from the
  thread or project, so the app never names a host path. Listing and search reject a
  folder whose canonical path leaves the root. They skip Git internals,
  symlinks, and special files. They show hidden files unless the eye button
  hides them, and ignored files unless the ignored-files button hides them.
  To hide ignored files, the host asks Git: `git check-ignore` for each
  folder page, before the page is built. Outside a Git work tree, nothing is
  ignored. When Git fails, the Explorer says so instead of showing
  everything. A directory page holds at most 200 entries. Search lists files
  with `rg --files` (ripgrep), with no entry or depth limit, and stops after
  10 seconds. Set `ESSENTIALS_RG_BIN` when `rg` is not on the host's `PATH`.
  To hide ignored files, ripgrep follows `.gitignore`, and one
  `git ls-files --cached --ignored` adds back the tracked files that match
  it. Search keeps the best 200 matches and ranks filename matches first. It
  skips dependency and cache folders such as `node_modules`, `.venv`, and
  `.cache`. A notice marks a partial result. A new search cancels the same
  explorer's older one. Each read has a 15-second deadline. The
  plugin reads no file content: bb's preview shows it. The view state lives
  in the app's session storage, or in memory when storage is unavailable, so
  closing bb clears it. The hidden-files and ignored-files choices live in
  local storage.
- **Search.** The host runs `rg --json` (ripgrep) in the checkout. Set
  `ESSENTIALS_RG_BIN` when `rg` is not on the host's `PATH`. Search follows
  `.gitignore` unless **Search ignored files** is on, follows no link, and
  skips files above 1 MB and the folders that filename search skips, such as
  `node_modules`. An Include pattern cannot re-include one of those folders.
  Use **Search in folder** on it instead. One search returns at most 200
  files, 1,000 matches, and 50 matches per file, and stops after 10 seconds.
  A notice marks a partial result. A new search cancels the same panel's
  older one. An invalid regular expression or glob shows ripgrep's message.
- **Explorer Git status.** The host runs `git status --porcelain=v1 -z
--no-renames --untracked-files=normal --ignored=traditional -- .` in the
  checkout, with `GIT_OPTIONAL_LOCKS=0` so it never takes the index lock.
  Git reports an untracked or ignored folder once, and its contents inherit
  that status. A rename shows as a delete and an add. One read keeps at most
  20,000 entries. Git output stays on the host: an error says only that the
  read failed.
- **Explorer delete.** The host deletes only an entry inside the canonical
  root that is still the confirmed kind and is not a symlink. A folder delete
  removes links inside the folder, never their targets. Git internals cannot
  be deleted.
- **CLI maintenance.** bb updates its harnesses and lists their models
  itself, so this adapter leaves out Paseo's Harnesses screen.

## Settings

The **Context Reminder** page in the navigation rail and the plugin's settings
page in bb hold the same Context Reminder settings: Show Context Reminder,
Warn at, Ask to compact at, Remind every, Snooze for, and Assistant. The page
saves each change at once. The defaults match Paseo's.

The plugin's settings page also holds the Cleaner settings: suggest old
threads (on), suggest after (7 days), delete provider sessions (off), and
optional absolute paths for the Claude config directory, the Codex home, and
the Codex binary. An empty path uses the one recorded for the thread, then
the host default.

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

Adapter code lives in `server.ts`, `host.ts`, `server/engine/bb/`,
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
