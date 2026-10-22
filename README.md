# agent-plugins

Plugins for agent hosts. Each plugin has one npm package that holds its
host-neutral core, and one adapter per host.

```
packages/<plugin>/      the plugin's core: logic, stores, schemas and their tests
paseo/<plugin>/         Paseo plugin (installable on its own)
bb/<plugin>/            bb plugin (installable on its own)
.bb/plugins.json        bb collection manifest: names each bb plugin
```

Each adapter depends on its core with `"<plugin>": "file:../../packages/<plugin>"`
and imports modules by name, such as `conductor/symphonies/commands`. Edit the
core only in `packages/<plugin>/`. The core's lint forbids host SDK imports.

npm links the package as a symlink, so core edits are live in every adapter.

- **Paseo:** the manifest `build` step runs `npm install` on a Git install.
- **bb:** a Git install deletes `.npmrc` and installs only the plugin
  directory. bb's bundler then resolves `zod` from the core's real path. The
  core's `tsconfig.json` `paths` fall back to the bb adapter's `zod`.

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
