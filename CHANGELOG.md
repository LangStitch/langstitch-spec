# Changelog

All notable changes to **langstitch-spec** are documented here.

## [2.0.0] - 2026-07-12

### Added
- **IR document schema (v2)** — `logical` / `presentation` / `target` split; Zod source in `src/ir.ts`,
  exported JSON Schema in `schemas/ir-document.schema.json`.
- **RunEvent protocol** — dev-only SSE events with per-run `seq`, run manifest schema.
- **Compiler protocol** — compile result, build manifest, parse result, capability matrices.
- **v1 → v2 migration** — `migrateV1toV2()` splits canvas layout from logical graphs; maps component
  templates to `templates["python-langstitch"]`.
- **Conformance fixtures** — `minimal-llm`, `router-workflow`, `config-heavy` with stubs and expected traces.
- **Conformance harness** — `harness/conformance.py` (~30 checks: auth, SSE, trace order, JSON logs, secret leak).
- **Capability matrices** — `capabilities/python-langstitch.json`, `capabilities/spring-ai.json`.

### Fixed
- `Presentation.default()` now supplies full default object (`canvasByGraph`, `navigationPath`, `ui`).

[2.0.0]: https://github.com/LangStitch/langstitch-spec/releases/tag/v2.0.0
