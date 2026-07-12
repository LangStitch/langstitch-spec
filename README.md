# langstitch-spec

The LangStitch IR specification: the language-neutral representational layer that the LangTailor canvas edits and per-platform compilers (Python `langstitch-sdk`, Spring AI) turn into runnable projects.

## The three contracts

| Contract | Source | JSON Schema |
|----------|--------|-------------|
| IR document (`*.langstitch.json` v2) | `src/ir.ts` | `schemas/ir-document.schema.json` |
| Runtime event protocol (live visualization) | `src/runEvents.ts` | `schemas/run-event.schema.json`, `run-manifest` |
| Compiler protocol (compile/parse/capabilities) | `src/compilerProtocol.ts` | `compile-result`, `parse-result`, `build-manifest`, `compiler-capabilities` |

## Document shape (v2)

```jsonc
{
  "irVersion": "2.0.0",
  "name": "my_workflow",
  "logical": { /* graphs, registries, configuration, settings — compilers read this */ },
  "presentation": { /* canvas layout — compilers MUST ignore */ },
  "target": { "platform": "python-langstitch" | "spring-ai", "options": {} }
}
```

Key invariants:

- **IR node ids survive compilation** — they appear in generated code, build manifests, and every runtime event.
- **RunEvents are development-only** — the endpoint is never mounted without the dev flag (`LANGSTITCH_DEV_EVENTS=1` / `langstitch-dev` profile), localhost-only when enabled.
- **The `application.yaml` shape is part of the contract** — same section names/prefixes on every target; only accessor code is platform-idiomatic.
- **Secrets never appear literally** in documents or generated output; `secret`-typed config properties reference environment variables.

## Layout

- `src/` — Zod schema source of truth
- `schemas/` — exported JSON Schema (run `npm run export-schemas`)
- `fixtures/` — conformance fixtures: `document.langstitch.json` + `stubs.json` (deterministic LLM/tool stubs) + `expected-trace.json` (partial-order execution trace) that every compiler must pass
- `capabilities/` — per-platform capability matrices (consumed by the canvas for design-time badges)
- `docs/` — migration and convention specs

## Develop

```bash
npm install
npm run export-schemas   # regenerate schemas/ after editing src/
npm test                 # fixture validation + v1 migration corpus
```

See [CHANGELOG.md](CHANGELOG.md) for release history.
