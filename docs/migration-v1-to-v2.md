# Migrating v1.x documents to IR v2

Implemented in `src/migrate.ts` (`migrateV1toV2`). Applied automatically by the LangTailor document loader; saves always write v2. Migration is one-way.

## Field mapping

| v1 (flat) | v2 |
|-----------|----|
| `version: "1.0"\|"1.1"\|"1.2"` | `irVersion: "2.0.0"` |
| `canvasByGraph[id].nodes[].data` | `logical.graphs[].nodes[]` (typed, discriminated on `kind`) |
| `canvasByGraph[id].nodes[].position` | `presentation.canvasByGraph[id].nodes[]` |
| `subgraphs[]` metadata | merged into `logical.graphs[]` (`name`, `parentId`, `stateFields`) |
| `stateFields` (top-level) | `logical.graphs[main].stateFields` |
| `toolRegistry`, `agentRegistry`, ... | `logical.*` (unchanged shapes) |
| `settings.observability.logging` | `logical.settings.logging` (sink/rotation model) |
| `settings.checkpoint` + `settings.checkpointer` | `logical.settings.checkpointer` (literal connection strings dropped — env var refs only) |
| `componentRegistry[].codegen.template` | `codegen.templates["python-langstitch"]` |
| export format (sessionStorage, not persisted) | `target.platform` (default `python-langstitch`; v1 `full` = python + `settings.deployment` flags) |
| — (new) | `logical.configuration`, `logical.settings.security`, `target` |

## Behavioral defaults introduced by v2

- `settings.security.auth` defaults to `api_key` — generated servers require auth unless `none` is chosen explicitly.
- `settings.logging` defaults to structured JSON on stdout; prompt/completion content capture defaults to off.
- Legacy top-level `nodes`/`edges` mirrors are not carried into v2.

## Compatibility

Compilers must refuse documents whose `irVersion` major.minor is newer than they support (see `compiler-capabilities.schema.json`). A minor IR bump must keep all previous fixtures passing.
