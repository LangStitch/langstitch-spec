/**
 * v1.x -> v2.0 migration.
 *
 * v1 documents are flat: logical data is embedded in React Flow node `data`
 * inside `canvasByGraph`, registries sit at the top level, and there is no
 * persisted target. Migration:
 *  - splits each canvas into a LogicalGraph (typed nodes, no layout) and a
 *    CanvasLayout (positions/viewport only)
 *  - moves registries and settings under `logical`
 *  - rewrites single component codegen templates to the per-platform map
 *  - defaults `target` to python-langstitch (the only v1 behavior)
 *
 * Migration is one-way. Unknown fields are preserved where the schema is
 * loose; anything else is dropped deliberately, not silently mangled.
 */
import { IR_VERSION, IrDocument, type IrDocumentT } from './ir'

type AnyRecord = Record<string, unknown>

const arr = (v: unknown): AnyRecord[] => (Array.isArray(v) ? (v as AnyRecord[]) : [])
const rec = (v: unknown): AnyRecord => (v && typeof v === 'object' && !Array.isArray(v) ? (v as AnyRecord) : {})
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)

export function migrateV1toV2(v1: AnyRecord): IrDocumentT {
  const version = str(v1.version)
  if (!/^1\./.test(version)) {
    throw new Error(`migrateV1toV2 expects a 1.x document, got version=${version || '<missing>'}`)
  }

  const canvasByGraph = rec(v1.canvasByGraph)
  const subgraphs = arr(v1.subgraphs)
  const mainId = str(v1.activeSubgraphId, 'main') || 'main'

  // Every canvas key becomes a logical graph; subgraph metadata enriches it.
  const graphIds = new Set<string>([...Object.keys(canvasByGraph), ...subgraphs.map((s) => str(s.id))])
  if (graphIds.size === 0) graphIds.add(mainId)

  const graphs = [...graphIds].filter(Boolean).map((graphId) => {
    const canvas = rec(canvasByGraph[graphId])
    const sub = subgraphs.find((s) => str(s.id) === graphId)
    const rfNodes = arr(canvas.nodes)
    return {
      id: graphId,
      name: str(sub?.name, graphId === mainId ? 'Main Graph' : graphId),
      parentId: (sub?.parentId as string | null | undefined) ?? null,
      stateFields: (sub && Array.isArray(sub.stateFields) && sub.stateFields.length > 0
        ? sub.stateFields
        : graphId === mainId
          ? arr(v1.stateFields)
          : []) as never,
      nodes: rfNodes.map((n) => ({ id: str(n.id), ...rec(n.data) })) as never,
      edges: arr(canvas.edges).map((e) => ({
        id: str(e.id),
        source: str(e.source),
        target: str(e.target),
        ...(e.sourceHandle ? { sourceHandle: str(e.sourceHandle) } : {}),
        ...(e.label ? { label: str(e.label) } : {}),
      })),
    }
  })

  const presentation = {
    canvasByGraph: Object.fromEntries(
      Object.entries(canvasByGraph).map(([graphId, canvas]) => {
        const c = rec(canvas)
        return [
          graphId,
          {
            nodes: arr(c.nodes).map((n) => ({
              id: str(n.id),
              position: rec(n.position) as { x: number; y: number },
            })),
            ...(c.viewport ? { viewport: c.viewport as never } : {}),
            annotations: arr(c.annotations) as never,
          },
        ]
      }),
    ),
    navigationPath: (Array.isArray(v1.navigationPath) ? v1.navigationPath : [mainId]) as string[],
    ui: {},
  }

  const componentRegistry = arr(v1.componentRegistry).map((m) => {
    const codegen = rec(m.codegen)
    const template = str(codegen.template)
    return {
      ...m,
      label: str(m.label, str(m.id)),
      codegen: {
        ...codegen,
        template: undefined,
        templates: template ? { 'python-langstitch': template } : {},
      },
    }
  })

  const candidate = {
    irVersion: IR_VERSION,
    name: str(v1.name, 'untitled'),
    ...(v1.description ? { description: str(v1.description) } : {}),
    projectVersion: str(v1.projectVersion, '0.1.0'),
    logical: {
      entryGraphId: mainId,
      graphs,
      configuration: [],
      settings: migrateSettings(rec(v1.settings)),
      toolRegistry: arr(v1.toolRegistry),
      agentRegistry: arr(v1.agentRegistry),
      skillRegistry: arr(v1.skillRegistry),
      guardrailRegistry: arr(v1.guardrailRegistry),
      businessRuleRegistry: arr(v1.businessRuleRegistry),
      personaRegistry: arr(v1.personaRegistry),
      ragPipelines: arr(v1.ragPipelines),
      mcpServers: arr(v1.mcpServers),
      remoteGraphs: arr(v1.remoteGraphs),
      componentRegistry,
    },
    presentation,
    target: { platform: 'python-langstitch', options: {} },
  }

  return IrDocument.parse(candidate)
}

function migrateSettings(s: AnyRecord): AnyRecord {
  const obs = rec(s.observability)
  const log = rec(obs.logging)
  const cp = rec(s.checkpointer)
  const langsmith = rec(obs.langsmith)
  const langfuse = rec(obs.langfuse)

  const level = str(log.level, 'info').toLowerCase()
  return {
    maxSteps: typeof s.maxSteps === 'number' ? s.maxSteps : 50,
    enableStreaming: s.enableStreaming !== false,
    interruptBefore: str(s.interruptBefore),
    tags: str(s.tags),
    checkpointer: {
      manager: str(cp.manager, str(s.checkpoint, 'none')) || 'none',
      // v1 stored literal connection strings; v2 only stores env var names.
      connectionStringEnvVar: '',
      tablePrefix: str(cp.tablePrefix),
      ttlSeconds: typeof cp.ttlSeconds === 'number' ? cp.ttlSeconds : 0,
    },
    server: {},
    model: {},
    observability: {
      enabled: obs.enabled === true,
      provider: str(obs.provider, 'langsmith') || 'langsmith',
      projectName: str(obs.projectName),
      apiKeyEnv: str(obs.apiKeyEnv),
      captureContent: false,
      sampling: 1,
      langsmith: {
        enabled: langsmith.enabled === true,
        projectName: str(langsmith.projectName),
        apiKeyEnv: str(langsmith.apiKeyEnv, 'LANGSMITH_API_KEY') || 'LANGSMITH_API_KEY',
        tracingV2: langsmith.tracingV2 !== false,
      },
      langfuse: {
        enabled: langfuse.enabled === true,
        publicKeyEnv: str(langfuse.publicKeyEnv, 'LANGFUSE_PUBLIC_KEY') || 'LANGFUSE_PUBLIC_KEY',
        secretKeyEnv: str(langfuse.secretKeyEnv, 'LANGFUSE_SECRET_KEY') || 'LANGFUSE_SECRET_KEY',
        host: str(langfuse.host, 'https://cloud.langfuse.com') || 'https://cloud.langfuse.com',
        release: str(langfuse.release),
      },
    },
    logging: {
      level: ['debug', 'info', 'warning', 'error'].includes(level) ? level : 'info',
      levels: {},
      format: str(log.format, 'json') === 'text' ? 'text' : 'json',
      sink: log.logToFile === true ? 'file' : 'stdout',
      ...(log.logToFile === true
        ? { file: { path: str(log.filePath, 'logs/app.log') || 'logs/app.log', maxSizeMb: 20, maxAgeDays: 14, maxBackups: 5 } }
        : {}),
      captureContent: false,
    },
    // v1 had no security model; v2 defaults to auth-required.
    security: {},
    deployment: {},
    lifecycle: {
      onStartup: str(rec(s.lifecycle).onStartup),
      onShutdown: str(rec(s.lifecycle).onShutdown),
    },
  }
}
