/**
 * Compiler protocol — how the IDE talks to per-platform compilers.
 *
 * One-shot:  `<compiler> compile <file> --out <dir>`
 * Daemon:    `<compiler> compile --serve` — JSON-RPC 2.0 over stdio, one
 *            request/response object per line (LSP-style but newline-delimited).
 *
 * Methods:
 *  - `capabilities()` -> Capabilities
 *  - `compile({ document })` -> CompileResult
 *  - `parse({ files, document })` -> ParseResult   (reverse sync; mandatory)
 */
import { z } from 'zod'

export const Capabilities = z.object({
  compilerVersion: z.string(),
  platform: z.string(),
  /** IR major.minor versions this compiler accepts, e.g. ["2.0"]. */
  irVersions: z.array(z.string()),
  supportsParse: z.boolean(),
  supportsDaemon: z.boolean(),
})

/** Source map entry: where an IR node landed in generated code. */
export const BuildManifestEntry = z.object({
  nodeId: z.string(),
  file: z.string(),
  line: z.number().int(),
  /** Generated symbol (function/class) implementing the node. */
  symbol: z.string().optional(),
})

export const BuildManifest = z.object({
  irVersion: z.string(),
  compilerVersion: z.string(),
  platform: z.string(),
  entrypoint: z.string(),
  nodes: z.array(BuildManifestEntry),
})

export const CompileResult = z.object({
  /** Relative path -> file contents. */
  files: z.record(z.string(), z.string()),
  manifest: BuildManifest,
  warnings: z.array(z.string()).default([]),
})

export const UnsupportedFeatureError = z.object({
  code: z.literal('unsupported_feature'),
  nodeId: z.string().optional(),
  feature: z.string(),
  message: z.string(),
})

export const ParseResult = z.object({
  /** IR document with logical section updated from the edited files. */
  document: z.record(z.string(), z.unknown()),
  /** Files or regions the parser could not map back — never silently dropped. */
  unsyncable: z
    .array(z.object({ file: z.string(), reason: z.string() }))
    .default([]),
})

export type CapabilitiesT = z.infer<typeof Capabilities>
export type CompileResultT = z.infer<typeof CompileResult>
