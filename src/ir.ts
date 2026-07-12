/**
 * LangStitch IR v2 — the language-neutral representational layer.
 *
 * A `.langstitch.json` document has three top-level sections:
 *  - `logical`      — everything a compiler reads (graph, registries, settings).
 *  - `presentation` — everything only the IDE reads (positions, viewports).
 *  - `target`       — the persisted compilation target.
 *
 * Compilers MUST ignore `presentation`. IR node ids survive compilation: they
 * appear in generated code, build manifests, and every runtime event.
 */
import { z } from 'zod'

export const IR_VERSION = '2.0.0'

// ── Scalars ──────────────────────────────────────────────────────────────

export const StateFieldType = z.enum(['str', 'int', 'float', 'bool', 'list', 'dict', 'messages'])

export const StateField = z.object({
  id: z.string(),
  name: z.string(),
  type: StateFieldType,
  /** Reducer semantics (neutral): `append` accumulates, `replace` overwrites. */
  reducer: z.enum(['append', 'replace']).optional(),
  defaultValue: z.string().optional(),
})

// ── Nodes (discriminated on `kind`) ──────────────────────────────────────

const baseNode = {
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  /** User-editable implementation body kept in sync by `parse` (reverse sync). */
  customCode: z.string().optional(),
}

export const StartNode = z.object({ ...baseNode, kind: z.literal('start') })
export const EndNode = z.object({ ...baseNode, kind: z.literal('end') })

export const LlmNode = z.object({
  ...baseNode,
  kind: z.literal('llm'),
  model: z.string(),
  systemPrompt: z.string().default(''),
  userPrompt: z.string().default(''),
  temperature: z.number().default(0.7),
  maxTokens: z.number().int().default(4096),
  topP: z.number().default(1),
  outputKey: z.string().default('messages'),
  boundToolIds: z.array(z.string()).default([]),
  boundAgentIds: z.array(z.string()).default([]),
})

export const ToolNode = z.object({
  ...baseNode,
  kind: z.literal('tool'),
  connectionType: z.enum(['inline', 'registry', 'mcp']).default('inline'),
  toolRegistryId: z.string().default(''),
  mcpServerId: z.string().default(''),
  mcpToolName: z.string().default(''),
  toolName: z.string().default(''),
  toolDescription: z.string().default(''),
  inputSchema: z.string().default(''),
  inputKey: z.string().default('input'),
  outputKey: z.string().default('output'),
})

export const RouterBranch = z.object({
  id: z.string(),
  label: z.string(),
  /** Python-syntax boolean expression over `state` (neutral subset: comparisons, in, and/or/not). */
  condition: z.string(),
  targetNodeId: z.string().optional(),
})

export const RouterNode = z.object({
  ...baseNode,
  kind: z.literal('router'),
  routerFn: z.string().default(''),
  branches: z.array(RouterBranch).default([]),
})

export const FunctionNode = z.object({
  ...baseNode,
  kind: z.literal('function'),
  functionName: z.string().default(''),
  code: z.string().default(''),
  outputKey: z.string().default('output'),
})

export const SubgraphNode = z.object({
  ...baseNode,
  kind: z.literal('subgraph'),
  connectionType: z.enum(['local', 'remote']).default('local'),
  subgraphId: z.string().default(''),
  remoteGraphId: z.string().default(''),
  remoteEndpoint: z.string().default(''),
  inputMapping: z.string().default(''),
  outputMapping: z.string().default(''),
})

export const AgentNode = z.object({
  ...baseNode,
  kind: z.literal('agent'),
  connectionType: z.enum(['subagent', 'remote', 'a2a', 'registry']).default('registry'),
  agentRegistryId: z.string().default(''),
  subgraphId: z.string().default(''),
  remoteAgentId: z.string().default(''),
  a2aAgentId: z.string().default(''),
  inputMapping: z.string().default(''),
  outputMapping: z.string().default(''),
  delegateTools: z.boolean().default(false),
})

export const RagNode = z.object({
  ...baseNode,
  kind: z.literal('rag'),
  pipelineId: z.string(),
  queryKey: z.string().default('query'),
  outputKey: z.string().default('context'),
  personaId: z.string().default(''),
  skillIds: z.array(z.string()).default([]),
  guardrailIds: z.array(z.string()).default([]),
  includeSources: z.boolean().default(false),
})

export const IntentDefinition = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().default(''),
  examples: z.string().default(''),
})

export const IntentClassifierNode = z.object({
  ...baseNode,
  kind: z.literal('intent_classifier'),
  model: z.string(),
  systemPrompt: z.string().default(''),
  confidenceThreshold: z.number().default(0.5),
  fallbackIntent: z.string().default(''),
  multiIntent: z.boolean().default(false),
  intents: z.array(IntentDefinition).default([]),
  classifierFn: z.string().default(''),
})

export const HitlNode = z.object({
  ...baseNode,
  kind: z.literal('hitl'),
  interactionType: z.enum(['approval', 'edit', 'input']).default('approval'),
  promptMessage: z.string().default(''),
  outputKey: z.string().default('human_response'),
  approveLabel: z.string().default('Approve'),
  rejectLabel: z.string().default('Reject'),
  allowEdit: z.boolean().default(false),
  timeoutSeconds: z.number().int().default(0),
})

export const ResponseTransformerNode = z.object({
  ...baseNode,
  kind: z.literal('response_transformer'),
  transformType: z.enum(['template', 'expression', 'python']).default('template'),
  template: z.string().default(''),
  expression: z.string().default(''),
  code: z.string().default(''),
  inputKey: z.string().default('messages'),
  outputKey: z.string().default('response'),
})

export const CustomNode = z.object({
  ...baseNode,
  kind: z.literal('custom'),
  componentId: z.string(),
  config: z.record(z.string(), z.unknown()).default({}),
  outputKey: z.string().optional(),
})

export const GraphNode = z.discriminatedUnion('kind', [
  StartNode,
  EndNode,
  LlmNode,
  ToolNode,
  RouterNode,
  FunctionNode,
  SubgraphNode,
  AgentNode,
  RagNode,
  IntentClassifierNode,
  HitlNode,
  ResponseTransformerNode,
  CustomNode,
])

export const GraphEdge = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  /** For router nodes: the branch id this edge represents. */
  sourceHandle: z.string().optional(),
  label: z.string().optional(),
})

/** One logical graph (main graph or subgraph): typed nodes + edges, no layout. */
export const LogicalGraph = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable().default(null),
  stateFields: z.array(StateField).default([]),
  nodes: z.array(GraphNode),
  edges: z.array(GraphEdge),
})

// ── Registries ───────────────────────────────────────────────────────────

export const ToolDefinition = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  source: z.enum(['builtin', 'mcp', 'python', 'http', 'langchain']).default('python'),
  mcpServerId: z.string().default(''),
  mcpToolName: z.string().default(''),
  inputSchema: z.string().default(''),
  pythonCode: z.string().default(''),
  httpEndpoint: z.string().default(''),
  tags: z.string().default(''),
})

export const AgentDefinition = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  kind: z.enum(['subagent', 'remote', 'a2a', 'supervisor']).default('subagent'),
  subgraphId: z.string().default(''),
  remoteUrl: z.string().default(''),
  a2aAgentCardUrl: z.string().default(''),
  model: z.string().default(''),
  systemPrompt: z.string().default(''),
  toolIds: z.array(z.string()).default([]),
  authEnvVar: z.string().default(''),
})

export const SkillDefinition = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  instructions: z.string().default(''),
  toolIds: z.array(z.string()).default([]),
  personaId: z.string().default(''),
  promptTemplate: z.string().default(''),
  tags: z.string().default(''),
})

export const GuardrailDefinition = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  type: z.enum(['input', 'output', 'both']).default('input'),
  policy: z.string().default(''),
  action: z.enum(['block', 'warn', 'redact', 'rewrite']).default('warn'),
  severity: z.enum(['low', 'medium', 'high']).default('medium'),
  enabled: z.boolean().default(true),
})

export const BusinessRuleDefinition = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  condition: z.string().default(''),
  action: z.string().default(''),
  priority: z.number().int().default(0),
  enabled: z.boolean().default(true),
})

export const PersonaDefinition = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string().default(''),
  tone: z.string().default(''),
  systemPrompt: z.string().default(''),
  constraints: z.string().default(''),
  vocabulary: z.string().default(''),
})

export const RagPipelineConfig = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  chunkStrategy: z.enum(['recursive', 'fixed', 'semantic', 'markdown', 'sentence']).default('recursive'),
  chunkSize: z.number().int().default(1000),
  chunkOverlap: z.number().int().default(200),
  embeddingProvider: z.enum(['openai', 'cohere', 'huggingface', 'local']).default('openai'),
  embeddingModel: z.string().default(''),
  retrievalMode: z.enum(['vector', 'vectorless', 'hybrid']).default('vector'),
  vectorStore: z.enum(['chroma', 'pinecone', 'pgvector', 'faiss', 'in_memory']).default('in_memory'),
  topK: z.number().int().default(4),
  rerankEnabled: z.boolean().default(false),
  rerankModel: z.string().default(''),
  sourcePaths: z.string().default(''),
  metadataFilters: z.string().default(''),
})

export const McpServerDefinition = z.object({
  id: z.string(),
  name: z.string(),
  transport: z.enum(['stdio', 'sse', 'streamable-http']).default('stdio'),
  command: z.string().default(''),
  args: z.string().default(''),
  url: z.string().default(''),
  envVars: z.string().default(''),
  tools: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().default(''),
        inputSchema: z.string().default(''),
      }),
    )
    .default([]),
  resources: z
    .array(
      z.object({
        id: z.string(),
        uri: z.string(),
        name: z.string().default(''),
        description: z.string().default(''),
        mimeType: z.string().default(''),
      }),
    )
    .default([]),
})

export const RemoteGraphRef = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  description: z.string().optional(),
  authEnvVar: z.string().default(''),
  version: z.string().default(''),
})

/** Per-platform codegen for marketplace/custom components. */
export const ComponentCodegen = z.looseObject({
  /**
   * Templates keyed by target platform id ("python-langstitch", "spring-ai").
   * A compiler fails loudly when a used component lacks its platform's entry.
   */
  templates: z.record(z.string(), z.string()).default({}),
  imports: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
})

/**
 * Component manifest. Loose: UI-facing fields (ports, theme, configFields)
 * pass through untouched — only identity and codegen are contract-relevant.
 */
export const ComponentManifestRef = z.looseObject({
  id: z.string(),
  label: z.string().default(''),
  version: z.string().optional(),
  description: z.string().default(''),
  category: z.string().default(''),
  codegen: ComponentCodegen.default({ templates: {} }),
})

// ── Configuration model (uniform YAML contract across targets) ───────────

/** Platform-neutral property types with defined Python/Java mappings. */
export const ConfigPropertyType = z.enum([
  'string',
  'int',
  'float',
  'bool',
  'list',
  'map',
  'duration',
  'secret',
])

export const ConfigProperty = z.object({
  name: z.string(),
  type: ConfigPropertyType,
  default: z.unknown().optional(),
  description: z.string().default(''),
  required: z.boolean().default(false),
  /** For `secret` type: the environment variable the value must come from. */
  envVar: z.string().optional(),
})

export const ConfigSection = z.object({
  id: z.string(),
  /** YAML section name / prefix — identical on every target platform. */
  prefix: z.string(),
  description: z.string().default(''),
  properties: z.array(ConfigProperty).default([]),
})

// ── Settings ─────────────────────────────────────────────────────────────

export const LoggingSettings = z.object({
  /** Root level; per-category overrides go under `levels`. */
  level: z.enum(['debug', 'info', 'warning', 'error']).default('info'),
  levels: z.record(z.string(), z.enum(['debug', 'info', 'warning', 'error'])).default({}),
  format: z.enum(['text', 'json']).default('json'),
  /**
   * stdout: JSON/text lines to stdout only (containers; platform owns rotation).
   * file: adds an in-app rotating file in addition to stdout.
   */
  sink: z.enum(['stdout', 'file']).default('stdout'),
  file: z
    .object({
      path: z.string().default('logs/app.log'),
      maxSizeMb: z.number().int().default(20),
      maxAgeDays: z.number().int().default(14),
      maxBackups: z.number().int().default(5),
    })
    .optional(),
  /**
   * Whether prompt/completion content may appear in logs (DEBUG only even
   * when true). MUST default to false; production profiles keep it false.
   */
  captureContent: z.boolean().default(false),
})

export const SecuritySettings = z.object({
  /** Auth for the generated graph API. `none` is an explicit opt-out. */
  auth: z.enum(['none', 'api_key', 'bearer']).default('api_key'),
  /** Env var holding the API key / shared secret (never a literal value). */
  apiKeyEnvVar: z.string().default('LANGSTITCH_API_KEY'),
  corsOrigins: z.array(z.string()).default([]),
})

export const ObservabilitySettings = z.object({
  enabled: z.boolean().default(false),
  provider: z.enum(['langsmith', 'langfuse', 'opentelemetry', 'custom', 'multi']).default('langsmith'),
  projectName: z.string().default(''),
  apiKeyEnv: z.string().default(''),
  /** Include prompt/completion content in traces. Off by default. */
  captureContent: z.boolean().default(false),
  sampling: z.number().min(0).max(1).default(1),
  langsmith: z
    .object({
      enabled: z.boolean().default(false),
      projectName: z.string().default(''),
      apiKeyEnv: z.string().default('LANGSMITH_API_KEY'),
      tracingV2: z.boolean().default(true),
    })
    .optional(),
  langfuse: z
    .object({
      enabled: z.boolean().default(false),
      publicKeyEnv: z.string().default('LANGFUSE_PUBLIC_KEY'),
      secretKeyEnv: z.string().default('LANGFUSE_SECRET_KEY'),
      host: z.string().default('https://cloud.langfuse.com'),
      release: z.string().default(''),
    })
    .optional(),
})

export const CheckpointerSettings = z.object({
  manager: z.enum(['none', 'memory', 'postgres', 'sqlite', 'redis']).default('none'),
  connectionStringEnvVar: z.string().default(''),
  tablePrefix: z.string().default(''),
  ttlSeconds: z.number().int().default(0),
})

export const ServerSettings = z.object({
  host: z.string().default('0.0.0.0'),
  port: z.number().int().default(8000),
})

export const ModelSettings = z.object({
  provider: z.string().default('openai'),
  name: z.string().default('gpt-4o-mini'),
  temperature: z.number().optional(),
})

export const DeploymentSettings = z.object({
  docker: z.boolean().default(false),
  helm: z.boolean().default(false),
  compose: z.boolean().default(false),
  /** Keep the legacy Spring HTTP gateway as a deploy add-on. */
  springProxyGateway: z.boolean().default(false),
})

export const GraphSettings = z.object({
  maxSteps: z.number().int().default(50),
  enableStreaming: z.boolean().default(true),
  interruptBefore: z.string().default(''),
  tags: z.string().default(''),
  checkpointer: CheckpointerSettings.default({}),
  server: ServerSettings.default({}),
  model: ModelSettings.default({}),
  observability: ObservabilitySettings.default({}),
  logging: LoggingSettings.default({}),
  security: SecuritySettings.default({}),
  deployment: DeploymentSettings.default({}),
  lifecycle: z
    .object({ onStartup: z.string().default(''), onShutdown: z.string().default('') })
    .default({ onStartup: '', onShutdown: '' }),
})

// ── Target ───────────────────────────────────────────────────────────────

export const TargetPlatform = z.enum(['python-langstitch', 'spring-ai'])

export const Target = z.object({
  platform: TargetPlatform,
  options: z.record(z.string(), z.unknown()).default({}),
  /** Compiler version that last built this document (informational). */
  compilerVersion: z.string().optional(),
})

// ── Presentation (IDE-only; compilers MUST ignore) ───────────────────────

export const NodeLayout = z.object({
  /** IR node id. */
  id: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
})

export const CanvasLayout = z.object({
  nodes: z.array(NodeLayout).default([]),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }).optional(),
  annotations: z.array(z.record(z.string(), z.unknown())).default([]),
})

export const Presentation = z.object({
  canvasByGraph: z.record(z.string(), CanvasLayout).default({}),
  navigationPath: z.array(z.string()).default([]),
  ui: z.record(z.string(), z.unknown()).default({}),
})

// ── Document ─────────────────────────────────────────────────────────────

export const Logical = z.object({
  entryGraphId: z.string(),
  graphs: z.array(LogicalGraph),
  configuration: z.array(ConfigSection).default([]),
  settings: GraphSettings.default({}),
  toolRegistry: z.array(ToolDefinition).default([]),
  agentRegistry: z.array(AgentDefinition).default([]),
  skillRegistry: z.array(SkillDefinition).default([]),
  guardrailRegistry: z.array(GuardrailDefinition).default([]),
  businessRuleRegistry: z.array(BusinessRuleDefinition).default([]),
  personaRegistry: z.array(PersonaDefinition).default([]),
  ragPipelines: z.array(RagPipelineConfig).default([]),
  mcpServers: z.array(McpServerDefinition).default([]),
  remoteGraphs: z.array(RemoteGraphRef).default([]),
  componentRegistry: z.array(ComponentManifestRef).default([]),
})

export const IrDocument = z.object({
  irVersion: z.string().regex(/^2\.\d+\.\d+$/, 'IR v2 documents require irVersion 2.x.y'),
  name: z.string(),
  description: z.string().optional(),
  projectVersion: z.string().default('0.1.0'),
  logical: Logical,
  presentation: Presentation.default({ canvasByGraph: {}, navigationPath: [], ui: {} }),
  target: Target,
})

export type IrDocumentT = z.infer<typeof IrDocument>
export type LogicalGraphT = z.infer<typeof LogicalGraph>
export type GraphNodeT = z.infer<typeof GraphNode>
