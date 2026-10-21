# Conductor for bb

Planned. This adapter will implement the Conductor core host ports
(`shared/agents/host.ts`, `shared/symphonies/host.ts`) on the bb plugin SDK.
`node scripts/sync-core.mjs conductor bb` copies the core files listed in
`paseo/conductor/.core-files` here, at the same paths. Edit them in
`paseo/conductor/`, never here.
Data lives in `$CONDUCTOR_HOME` (default `~/.conductor`), shared with the Paseo
adapter.
