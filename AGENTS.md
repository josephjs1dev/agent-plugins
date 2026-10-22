# agent-plugins

## Project context

agent-plugins holds plugins for several agent hosts. Each plugin has one
adapter per host in `<host>/<plugin>/`. The npm package `packages/<plugin>/`
holds the plugin's host-neutral core. The plugins are Conductor (a Paseo adapter in
`paseo/conductor/`, with an experimental bb adapter in `bb/conductor/`) and
Essentials (a Paseo adapter in `paseo/essentials/`, with an experimental bb
adapter in `bb/essentials/`).

Each adapter depends on its core with `"<plugin>": "file:../../packages/<plugin>"`
and imports core modules by name, such as `conductor/symphonies/commands`.
npm links the package as a symlink. A bb Git install has no `zod` next to the
core, so the core's `tsconfig.json` `paths` fall back to the bb adapter's
`zod`. Edit the core only in
`packages/<plugin>/`. Conductor data lives in `$CONDUCTOR_HOME` (default
`~/.conductor`) for every host. Essentials data lives in `$ESSENTIALS_HOME`
(default `~/.essentials`).

## Always-on rules

Security rules apply to every change, regardless of language:

Read [Security rules](.agents/rules/security.md) before taking action.

## Language rules (load when relevant)

- **typescript** — read [.agents/rules/typescript/coding-styles.md](.agents/rules/typescript/coding-styles.md) when working in that language.

Open the relevant language rule file the first time you touch that language
in a session.

## Personas

Select a persona from the descriptions below before opening any persona file.
Load only the selected file, once per session; do not read both to decide.
Use SWE for implementation, debugging, tests, and code review. Use Team Leader
for team coordination, work allocation, and delivery planning, or when the user
explicitly requests it. For mixed tasks, choose the primary role; switch only
when the task changes or the user requests another role. Skip personas for
tasks that do not benefit from either role. A TODO-only file adds no guidance;
do not load the other persona as a fallback.

- SWE: [.agents/personas/swe.md](.agents/personas/swe.md)
- Team Leader: [.agents/personas/team_leader.md](.agents/personas/team_leader.md)

## Repository guide

Read [README.md](README.md) for the layout and plugin catalog. Before changing
Essentials, read [the Paseo README](paseo/essentials/README.md). Before changing
Conductor, read [the Paseo README](paseo/conductor/README.md). Before changing
the bb Conductor adapter, also read [its README](bb/conductor/README.md).
Before changing the bb Essentials adapter, also read
[its README](bb/essentials/README.md).
For frontend work, also read
[Frontend Coding Styles](.agents/rules/typescript/frontend-styles.md).

Put all plugin logic in the core package. The core has no entrypoints. Adapter
code holds only entrypoints and host glue that call the core. Keep host SDK
imports out of the core. Domain code reaches a host through its `host.ts`
ports. Adapter tests import core test fixtures by relative path, not through
`node_modules`. Keep each adapter independently installable, with
its own manifest, package, lockfile, runtime entries, README, and validation
scripts. Keep dependencies pinned and update the lockfile when they change.

## Validation

Run `npm run check` in `packages/<plugin>/` and in each changed
`<host>/<plugin>/`. The check runs type checking, linting, formatting checks, and tests. Tests use temporary
files and fake processes/HTTP responses; they do not require real credentials.
Live installation, reload, and visual verification are separate actions.
Run `git diff --check` for changes across the repository.

## Canonical instructions

Keep shared rules and personas in `.agents/`. Reserve `.codex/` and `.claude/`
for native configuration and command permissions. Edit `AGENTS.md` as the
canonical project instruction file and preserve the `CLAUDE.md` symlink to it.

## Commit and push

After completing changes and relevant validation, summarize the result and ask
whether to commit and push. Offer Commit and push, Commit only, and Leave
uncommitted. Do not commit or push without authorization; reuse authorization
already given for the current changes. Keep unrelated changes out of the commit.
