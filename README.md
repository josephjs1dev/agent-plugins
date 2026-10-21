# agent-plugins

Plugins for agent hosts. Each plugin has one adapter per host. The Paseo
adapter holds the source of the plugin's host-neutral core.

```
paseo/<plugin>/         Paseo plugin and the plugin's core (installable on its own)
bb/<plugin>/            bb plugin (installable on its own)
scripts/sync-core.mjs   copies a plugin's core into another host adapter
```

`paseo/<plugin>/.core-files` lists the core: the host-neutral modules in
`shared/` and `server/core/`, and their tests. Hosts install one plugin
directory on its own, so every other adapter commits a copy of these files at
the same paths. Edit core files only in the Paseo adapter, then copy them:

```bash
node scripts/sync-core.mjs conductor bb
```

Add `--check` to fail when a copy drifts. The Paseo adapter's lint forbids
Paseo SDK and adapter imports in core files.

## Plugins

| Plugin     | Paseo (with core)                     | bb                       |
| ---------- | ------------------------------------- | ------------------------ |
| Conductor  | [paseo/conductor](paseo/conductor/)   | [planned](bb/conductor/) |
| Essentials | [paseo/essentials](paseo/essentials/) | —                        |

Conductor turns an approved plan into a symphony of task agents and follows
the work to completion. It stores its data in `$CONDUCTOR_HOME` (default
`~/.conductor`) on every host.
[PARITY.md](PARITY.md) tracks what each host
adapter supports.

Essentials adds subscription limits, token history, workspace usage, coding
CLI maintenance, and context-window reminders.
