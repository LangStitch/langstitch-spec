import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { IrDocument } from '../src/ir'
import { RunEvent } from '../src/runEvents'
import { migrateV1toV2 } from '../src/migrate'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixturesDir = join(root, 'fixtures')

describe('conformance fixtures', () => {
  const fixtures = readdirSync(fixturesDir)

  it('has fixtures', () => {
    expect(fixtures.length).toBeGreaterThan(0)
  })

  for (const name of fixtures) {
    it(`${name}: document validates against the IR schema`, () => {
      const doc = JSON.parse(readFileSync(join(fixturesDir, name, 'document.langstitch.json'), 'utf-8'))
      const parsed = IrDocument.parse(doc)
      expect(parsed.irVersion).toMatch(/^2\./)
      // Every edge endpoint and layout entry must reference a real node id.
      for (const graph of parsed.logical.graphs) {
        const ids = new Set(graph.nodes.map((n) => n.id))
        for (const edge of graph.edges) {
          expect(ids.has(edge.source), `edge ${edge.id} source`).toBe(true)
          expect(ids.has(edge.target), `edge ${edge.id} target`).toBe(true)
        }
        const layout = parsed.presentation.canvasByGraph[graph.id]
        for (const n of layout?.nodes ?? []) {
          expect(ids.has(n.id), `layout node ${n.id}`).toBe(true)
        }
      }
    })

    it(`${name}: stubs and expected trace are present and reference real nodes`, () => {
      const doc = IrDocument.parse(
        JSON.parse(readFileSync(join(fixturesDir, name, 'document.langstitch.json'), 'utf-8')),
      )
      const allNodeIds = new Set(doc.logical.graphs.flatMap((g) => g.nodes.map((n) => n.id)))
      const stubs = JSON.parse(readFileSync(join(fixturesDir, name, 'stubs.json'), 'utf-8'))
      for (const nodeId of Object.keys(stubs.llm ?? {})) {
        expect(allNodeIds.has(nodeId), `stub llm node ${nodeId}`).toBe(true)
      }
      const trace = JSON.parse(readFileSync(join(fixturesDir, name, 'expected-trace.json'), 'utf-8'))
      for (const entry of trace.nodes) {
        expect(allNodeIds.has(entry.nodeId), `trace node ${entry.nodeId}`).toBe(true)
        for (const dep of entry.after) expect(allNodeIds.has(dep), `trace dep ${dep}`).toBe(true)
      }
    })
  }
})

describe('run events', () => {
  it('accepts a well-formed event sequence', () => {
    const events = [
      { type: 'run_started', runId: 'r1', seq: 0, ts: '2026-07-12T00:00:00Z', graph: 'main' },
      { type: 'node_started', runId: 'r1', seq: 1, ts: '2026-07-12T00:00:01Z', nodeId: 'llm-1' },
      {
        type: 'node_finished',
        runId: 'r1',
        seq: 2,
        ts: '2026-07-12T00:00:02Z',
        nodeId: 'llm-1',
        status: 'succeeded',
        durationMs: 812.5,
        stateDelta: { messages: ['hi'] },
      },
      { type: 'run_finished', runId: 'r1', seq: 3, ts: '2026-07-12T00:00:02Z', status: 'succeeded' },
    ]
    for (const e of events) expect(() => RunEvent.parse(e)).not.toThrow()
  })

  it('rejects unknown event types', () => {
    expect(() => RunEvent.parse({ type: 'nope', runId: 'r', seq: 0, ts: '' })).toThrow()
  })
})

describe('v1 migration corpus (langtailor templates)', () => {
  const templatesDir = join(root, '..', 'langtailor', 'templates', 'graphs')
  const available = existsSync(templatesDir)

  it.skipIf(!available)('migrates every v1 template to a valid v2 document', () => {
    const files = readdirSync(templatesDir).filter((f) => f.endsWith('.langstitch.json'))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const v1 = JSON.parse(readFileSync(join(templatesDir, file), 'utf-8'))
      const v2 = migrateV1toV2(v1)
      expect(v2.irVersion, file).toMatch(/^2\./)
      expect(v2.target.platform, file).toBe('python-langstitch')
      // Logical nodes match the v1 canvas node count, layout preserved.
      const v1Main = v1.canvasByGraph?.[v1.activeSubgraphId ?? 'main']
      const v2Main = v2.logical.graphs.find((g) => g.id === v2.logical.entryGraphId)
      expect(v2Main, file).toBeDefined()
      if (v1Main && v2Main) {
        expect(v2Main.nodes.length, file).toBe(v1Main.nodes.length)
        expect(v2Main.edges.length, file).toBe(v1Main.edges.length)
        expect(v2.presentation.canvasByGraph[v2Main.id]?.nodes.length, file).toBe(v1Main.nodes.length)
      }
      // Component templates moved to the per-platform map.
      for (const comp of v2.logical.componentRegistry) {
        expect((comp.codegen as { template?: string }).template, file).toBeUndefined()
      }
    }
  })
})
