# agent-plugins

Plugins for agent hosts. Each plugin has one npm package that holds its
host-neutral core, and one adapter per host.

```
packages/<plugin>/      the plugin's core: logic, stores, schemas and their tests
paseo/<plugin>/         Paseo plugin (installable on its own)
bb/<plugin>/            bb plugin (installable on its own)
```

Each adapter depends on its core with `"<plugin>": "file:../../packages/<plugin>"`
and imports modules by name, such as `conductor/symphonies/commands`. Edit the
core only in `packages/<plugin>/`. The core's lint forbids host SDK imports.

- **Paseo** links the package as a symlink, so core edits are live. The
  manifest `build` step runs `npm install` on a Git install.
- **bb** copies the package into `node_modules` (`install-links=true` in
  `.npmrc`), because bb installs only the plugin directory. Run
  `npm run core:refresh` after a core edit. `npm run check` fails on a stale
  copy.

Adapter tests import core test fixtures by relative path
(`../../packages/<plugin>/tests/...`), not through `node_modules`.

## Plugins

| Plugin     | Paseo (with core)                     | bb                            |
| ---------- | ------------------------------------- | ----------------------------- |
| Conductor  | [paseo/conductor](paseo/conductor/)   | [experimental](bb/conductor/) |
| Essentials | [paseo/essentials](paseo/essentials/) | —                             |

Conductor turns an approved plan into a symphony of task agents and follows
the work to completion. It stores its data in `$CONDUCTOR_HOME` (default
`~/.conductor`) on every host.
[PARITY.md](PARITY.md) tracks what each host
adapter supports.

Essentials adds subscription limits, token history, workspace usage, coding
CLI maintenance, and context-window reminders.
