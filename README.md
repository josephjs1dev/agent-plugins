# agent-plugins

Plugins for agent hosts. Each plugin keeps host-neutral logic in a shared core
and one adapter per host.

```
packages/<plugin>/      host-neutral domain, contracts, and tests
paseo/<plugin>/         Paseo plugin (installable on its own)
bb/<plugin>/            bb plugin (installable on its own)
scripts/sync-core.mjs   generates a core's copy inside a host adapter
```

Hosts install one plugin directory on its own, so each adapter commits a
generated copy of its core. The sync places each core `src/` module where the
host's runtime rules allow it and rewrites imports. Edit core files only under
`packages/<plugin>/src/`, then sync:

```bash
node scripts/sync-core.mjs conductor paseo
```

Each adapter's `npm run check` fails when its copy drifts from the core.

## Plugins

| Plugin     | Core                                        | Paseo                                 | bb                       |
| ---------- | ------------------------------------------- | ------------------------------------- | ------------------------ |
| Conductor  | [packages/conductor](packages/conductor/)   | [paseo/conductor](paseo/conductor/)   | [planned](bb/conductor/) |
| Essentials | [packages/essentials](packages/essentials/) | [paseo/essentials](paseo/essentials/) | —                        |

Conductor turns an approved plan into a symphony of task agents and follows
the work to completion. It stores its data in `$CONDUCTOR_HOME` (default
`~/.conductor`) on every host.
[PARITY.md](PARITY.md) tracks what each host
adapter supports.

Essentials adds subscription limits, token history, workspace usage, coding
CLI maintenance, and context-window reminders.
