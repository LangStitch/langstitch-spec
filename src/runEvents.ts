/**
 * Runtime event protocol — live flow visualization.
 *
 * Every generated server exposes an SSE stream of these events, but ONLY when
 * dev mode is explicitly enabled (`LANGSTITCH_DEV_EVENTS=1` on Python, the
 * `langstitch-dev` profile on Spring), bound to localhost. Production starts
 * must not mount the endpoint and pay zero instrumentation cost.
 *
 * Events are keyed by IR node ids so the canvas can correlate execution with
 * the drawing. `seq` is a monotonically increasing per-run sequence number.
 */
import { z } from 'zod'

export const RUN_EVENTS_ENV_VAR = 'LANGSTITCH_DEV_EVENTS'
export const RUN_EVENTS_PATH = '/__langstitch/events'
export const RUN_MANIFEST_FILENAME = '.langstitch-run.json'

const base = {
  /** Unique id for this run. */
  runId: z.string(),
  /** Monotonic per-run sequence for ordering. */
  seq: z.number().int(),
  /** ISO-8601 timestamp. */
  ts: z.string(),
}

export const RunStarted = z.object({
  ...base,
  type: z.literal('run_started'),
  graph: z.string(),
  /** Input state snapshot (dev mode only ever sees this). */
  input: z.record(z.string(), z.unknown()).optional(),
})

export const NodeStarted = z.object({
  ...base,
  type: z.literal('node_started'),
  nodeId: z.string(),
})

export const NodeFinished = z.object({
  ...base,
  type: z.literal('node_finished'),
  nodeId: z.string(),
  status: z.enum(['succeeded', 'failed']),
  durationMs: z.number(),
  /** State updates produced by the node (a diff, not the full state). */
  stateDelta: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
})

export const TokenEvent = z.object({
  ...base,
  type: z.literal('token'),
  nodeId: z.string(),
  token: z.string(),
})

export const InterruptEvent = z.object({
  ...base,
  type: z.literal('interrupt'),
  nodeId: z.string(),
  prompt: z.string().optional(),
})

export const RunFinished = z.object({
  ...base,
  type: z.literal('run_finished'),
  status: z.enum(['succeeded', 'failed', 'interrupted']),
  /** Final state snapshot (dev mode only). */
  output: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
})

export const RunEvent = z.discriminatedUnion('type', [
  RunStarted,
  NodeStarted,
  NodeFinished,
  TokenEvent,
  InterruptEvent,
  RunFinished,
])

export type RunEventT = z.infer<typeof RunEvent>

/**
 * Run manifest — written by the dev-mode runtime to the project root so the
 * IDE can discover where the app is listening (port conflicts, multiple runs).
 */
export const RunManifest = z.object({
  pid: z.number().int(),
  host: z.string(),
  port: z.number().int(),
  eventsPath: z.string(),
  startedAt: z.string(),
  graph: z.string(),
})
