import { MOTION_PROMPT_VERSION, normalizeMotion, type MotionScript } from '../motion/script.js'
import { buildMessages, repairMessages, type MotionAsk } from './motionPrompt.js'
import { qwenChat, QwenError, type QwenConfig } from './qwen.js'

/**
 * POST /api/motion — ask Qwen to invent a move for one clause the robot has no animation for.
 * GET  /api/motion — { enabled } (the site switches the feature on only when this says so).
 *
 * Pure Web Request → Response, with the environment and fetch injected: the Vercel function
 * (api/motion.ts) and the Vite dev middleware both call it, and the tests drive it with a fake
 * fetch. Guards: JSON only and small; same-origin; a best-effort per-IP rate limit and a kill
 * switch; an in-memory cache so a popular move is invented once per server instance. User text is
 * never logged.
 */

export type MotionEnv = Record<string, string | undefined>

export interface MotionDeps {
  env: MotionEnv
  fetch: typeof fetch
  now?: () => number
}

export type MotionReply = { kind: 'move'; move: MotionScript } | { kind: 'not_motion' } | { kind: 'refused' }

export type MotionErrorCode =
  'bad_request' | 'forbidden' | 'rate_limited' | 'not_configured' | 'timeout' | 'upstream' | 'bad_output'

export const DEFAULT_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
export const DEFAULT_MODEL = 'qwen3.7-plus'

const MAX_BODY_BYTES = 2048
const MAX_TEXT = 200
const FIRST_TIMEOUT_MS = 22_000
const REPAIR_TIMEOUT_MS = 15_000
const RATE = { perMinute: 6, perDay: 60, instancePerDay: 800 }
const CACHE_SIZE = 200
const HINTS = new Set([
  'jump',
  'dance',
  'wave',
  'nod',
  'shake_head',
  'thumbs_up',
  'punch',
  'walk',
  'run',
  'turn',
  'sit',
  'stand',
  'sleep',
  'wake',
  'fall',
  'emote',
])
const KINDS = new Set(['unknown', 'mime', 'variation'])

// ------------------------------------------------------------------------------------ config

export function readConfig(env: MotionEnv): (QwenConfig & { enabled: boolean }) | null {
  const apiKey = env.DASHSCOPE_API_KEY?.trim() ?? ''
  if (!apiKey) return null
  return {
    apiKey,
    baseUrl: env.QWEN_BASE_URL?.trim() || DEFAULT_BASE_URL,
    model: env.QWEN_MODEL?.trim() || DEFAULT_MODEL,
    thinking: env.QWEN_THINKING?.trim().toLowerCase() === 'true',
    enabled: env.MOTION_AI_ENABLED?.trim().toLowerCase() !== 'false',
  }
}

// ------------------------------------------------------------------------ small in-memory state

const cache = new Map<string, MotionReply>()
function cacheGet(key: string): MotionReply | undefined {
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit)
  }
  return hit
}
function cacheSet(key: string, value: MotionReply): void {
  cache.set(key, value)
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!)
}

const hits = new Map<string, number[]>()
let instanceDay = { day: -1, count: 0 }

/** Records one request for `ip`; returns the seconds to wait when over a limit. */
function rateLimit(ip: string, now: number): number | null {
  const day = Math.floor(now / 86_400_000)
  if (instanceDay.day !== day) instanceDay = { day, count: 0 }
  if (instanceDay.count >= RATE.instancePerDay) return 3600
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 86_400_000)
  const lastMinute = list.filter((t) => now - t < 60_000)
  if (lastMinute.length >= RATE.perMinute) return Math.ceil((60_000 - (now - lastMinute[0]!)) / 1000)
  if (list.length >= RATE.perDay) return Math.ceil((86_400_000 - (now - list[0]!)) / 1000)
  list.push(now)
  hits.set(ip, list)
  if (hits.size > 5000) hits.delete(hits.keys().next().value!)
  instanceDay.count++
  return null
}

/** Test hook: forget the cache and the rate-limit counters. */
export function resetMotionState(): void {
  cache.clear()
  hits.clear()
  instanceDay = { day: -1, count: 0 }
}

// ---------------------------------------------------------------------------------- helpers

export function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  })
}

const fail = (status: number, error: MotionErrorCode, extra?: Record<string, string>) =>
  json(status, { error }, extra)

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

/** The page and the function share an origin; other origins may be allowed explicitly. */
export function originAllowed(req: Request, env: MotionEnv): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return false
  let host: string
  try {
    host = new URL(origin).host
  } catch {
    return false
  }
  const own = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host
  if (host === own) return true
  const extra = (env.MOTION_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)
  return extra.includes(origin.replace(/\/+$/, ''))
}

/** Control characters (C0 and DEL) become spaces. */
const isControl = (c: string) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127

export function cleanText(x: unknown): string | null {
  if (typeof x !== 'string') return null
  const t = Array.from(x.normalize('NFC'), (c) => (isControl(c) ? ' ' : c))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > 0 && t.length <= MAX_TEXT ? t : null
}

const cacheKey = (model: string, ask: MotionAsk) =>
  `${MOTION_PROMPT_VERSION}|${model}|${ask.kind ?? ''}|${ask.hint ?? ''}|${ask.clause.toLowerCase().replace(/[.!?,…]+$/u, '')}`

/** The model's text → a JSON object (tolerates code fences and stray prose around it). */
export function parseAnswer(text: string): unknown {
  const t = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
  try {
    return JSON.parse(t)
  } catch {
    const a = t.indexOf('{')
    const b = t.lastIndexOf('}')
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(t.slice(a, b + 1))
      } catch {
        /* fall through */
      }
    }
    return undefined
  }
}

type Interpreted = { ok: true; reply: MotionReply } | { ok: false; errors: string[] }

function interpret(answer: unknown): Interpreted {
  if (typeof answer !== 'object' || answer === null || Array.isArray(answer))
    return { ok: false, errors: ['the reply must be one JSON object'] }
  const a = answer as Record<string, unknown>
  const kind = typeof a.kind === 'string' ? a.kind.trim().toLowerCase() : ''
  if (kind === 'not_motion') return { ok: true, reply: { kind: 'not_motion' } }
  if (kind === 'refuse' || kind === 'refused') return { ok: true, reply: { kind: 'refused' } }
  if (kind !== 'move') return { ok: false, errors: ['"kind" must be "move", "not_motion" or "refuse"'] }
  const raw = typeof a.move === 'object' && a.move !== null ? a.move : a
  const r = normalizeMotion(raw)
  return r.ok ? { ok: true, reply: { kind: 'move', move: r.move } } : { ok: false, errors: r.errors }
}

// ---------------------------------------------------------------------------------- handler

export async function handleMotion(req: Request, deps: MotionDeps): Promise<Response> {
  const cfg = readConfig(deps.env)
  const enabled = cfg !== null && cfg.enabled
  if (req.method === 'GET' || req.method === 'HEAD') return json(200, { enabled, v: MOTION_PROMPT_VERSION })
  if (req.method !== 'POST') return fail(405, 'bad_request', { Allow: 'GET, POST' })
  if (!cfg || !enabled) return fail(503, 'not_configured')
  if (!originAllowed(req, deps.env)) return fail(403, 'forbidden')
  if (!(req.headers.get('content-type') ?? '').toLowerCase().includes('application/json'))
    return fail(415, 'bad_request')

  const text = await req.text().catch(() => '')
  if (!text || new TextEncoder().encode(text).length > MAX_BODY_BYTES) return fail(400, 'bad_request')
  let body: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      return fail(400, 'bad_request')
    body = parsed as Record<string, unknown>
  } catch {
    return fail(400, 'bad_request')
  }
  const clause = cleanText(body.clause)
  if (!clause) return fail(400, 'bad_request')
  const ask: MotionAsk = {
    clause,
    utterance: cleanText(body.utterance) ?? undefined,
    hint: typeof body.hint === 'string' && HINTS.has(body.hint) ? body.hint : null,
    kind:
      typeof body.kind === 'string' && KINDS.has(body.kind) ? (body.kind as MotionAsk['kind']) : undefined,
  }

  const key = cacheKey(cfg.model, ask)
  const cached = cacheGet(key)
  if (cached) return json(200, cached)

  const now = (deps.now ?? Date.now)()
  const wait = rateLimit(clientIp(req), now)
  if (wait !== null) return fail(429, 'rate_limited', { 'Retry-After': String(wait) })

  const messages = buildMessages(ask)
  try {
    const first = await qwenChat(cfg, messages, { fetch: deps.fetch, timeoutMs: FIRST_TIMEOUT_MS })
    let result = interpret(parseAnswer(first.content))
    if (!result.ok) {
      const retry = await qwenChat(cfg, repairMessages(messages, first.content, result.errors), {
        fetch: deps.fetch,
        timeoutMs: REPAIR_TIMEOUT_MS,
      })
      result = interpret(parseAnswer(retry.content))
    }
    if (!result.ok) {
      console.warn('[motion] the model returned an unusable move twice')
      return fail(502, 'bad_output')
    }
    cacheSet(key, result.reply)
    return json(200, result.reply)
  } catch (err) {
    if (err instanceof QwenError) {
      console.warn(`[motion] Qwen call failed: ${err.kind}${err.status ? ` ${err.status}` : ''}`)
      if (err.kind === 'timeout') return fail(504, 'timeout')
      if (err.kind === 'rate_limited') return fail(503, 'rate_limited', { 'Retry-After': '30' })
      return fail(502, 'upstream')
    }
    console.error('[motion] unexpected failure', err instanceof Error ? err.name : typeof err)
    return fail(500, 'upstream')
  }
}
