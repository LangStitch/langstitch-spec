/** Export all contract schemas as versioned JSON Schema files under schemas/. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { IR_VERSION, IrDocument } from '../src/ir'
import { RunEvent, RunManifest } from '../src/runEvents'
import { BuildManifest, Capabilities, CompileResult, ParseResult } from '../src/compilerProtocol'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'schemas')
mkdirSync(outDir, { recursive: true })

const exports: Record<string, z.ZodType> = {
  'ir-document': IrDocument,
  'run-event': RunEvent,
  'run-manifest': RunManifest,
  'build-manifest': BuildManifest,
  'compiler-capabilities': Capabilities,
  'compile-result': CompileResult,
  'parse-result': ParseResult,
}

for (const [name, schema] of Object.entries(exports)) {
  const jsonSchema = z.toJSONSchema(schema, { io: 'input', reused: 'defs' })
  const withMeta = {
    $id: `https://spec.langstitch.com/schemas/${name}.schema.json`,
    title: name,
    specVersion: IR_VERSION,
    ...jsonSchema,
  }
  writeFileSync(join(outDir, `${name}.schema.json`), JSON.stringify(withMeta, null, 2) + '\n')
  console.log(`schemas/${name}.schema.json`)
}
