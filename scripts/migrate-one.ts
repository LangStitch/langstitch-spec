/** Migrate a single v1 document to IR v2: `tsx scripts/migrate-one.ts <in> <out>` */
import { readFileSync, writeFileSync } from 'node:fs'
import { migrateV1toV2 } from '../src/migrate'

const [input, output] = process.argv.slice(2)
if (!input || !output) {
  console.error('usage: tsx scripts/migrate-one.ts <v1-document.json> <v2-output.json>')
  process.exit(1)
}
const v1 = JSON.parse(readFileSync(input, 'utf-8'))
const v2 = migrateV1toV2(v1)
writeFileSync(output, JSON.stringify(v2, null, 2))
console.log(`migrated: ${v2.name} -> ${output} (graphs: ${v2.logical.graphs.length})`)
