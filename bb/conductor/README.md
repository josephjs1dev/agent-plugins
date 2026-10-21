# Conductor for bb

Planned. This adapter will implement the Conductor core host ports
(`src/agents/host.ts`, `src/symphonies/host.ts`) on the bb plugin SDK,
and use `node scripts/sync-core.mjs conductor bb` to generate the core's copy here. Add a bb layout to
`scripts/sync-core.mjs` first.
Data lives in `$CONDUCTOR_HOME` (default `~/.conductor`), shared with the Paseo
adapter.
