import { buildMessages, CORRECT_PROMPT_VERSION, type CorrectSource } from './correctPrompt.js'
import {
  cleanText,
  clientIp,
  json,
  originAllowed,
  parseAnswer,
  readConfig,
  type MotionDeps,
  type MotionEnv,
} from './motionHandler.js'
import { qwenChat, QwenError, type QwenConfig } from './qwen.js'

/**
 * POST /api/correct — Qwen post-correction of one command: an ASR transcript, or typed text without
 * (or with wrong) diacritics. Fixes recognition/typing errors only; regional words stay.
 * GET  /api/correct — { enabled } (the site uses the step only when this says so).
 *
 * Same shape and guards as /api/motion (same key, same-origin, JSON only, per-IP rate limit, kill
 * switch CORRECT_AI_ENABLED=false, never logs user text). A correction that rewrites the sentence
 * instead of fixing it (e.g. turns "chừ … rứa" into "bây giờ … vậy") is rejected and the input kept.
 */

export type CorrectReply = { corrected: string; changed: boolean; rejected?: true }

export type CorrectErrorCode =
  'bad_request' | 'forbidden' | 'rate_limited' | 'not_configured' | 'timeout' | 'upstream' | 'bad_output'

const MAX_BODY_BYTES = 1024
const TIMEOUT_MS = 9_000
const TEMPERATURE = 0.1
const RATE = { perMinute: 20, perDay: 500, instancePerDay: 5000 }
const CACHE_SIZE = 500
const SOURCES = new Set<CorrectSource>(['asr', 'text'])

export function readCorrectConfig(env: MotionEnv): (QwenConfig & { enabled: boolean }) | null {
  const base = readConfig(env)
  if (!base) return null
  return {
    ...base,
    model: env.QWEN_CORRECT_MODEL?.trim() || base.model,
    // A correction is short: thinking would only add seconds before the robot moves.
    thinking: false,
    enabled: env.CORRECT_AI_ENABLED?.trim().toLowerCase() !== 'false',
  }
}

// ---------------------------------------------------------------- is it a correction at all?

/** Lowercase, no diacritics (đ → d), letters/digits only: what a pure correction mostly keeps. */
export function skeleton(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]!
}

/**
 * Restoring diacritics leaves the skeleton unchanged; fixing a misheard word changes a letter or
 * two. Translating dialect words or paraphrasing changes much more, so it is refused.
 */
export function plausibleCorrection(input: string, corrected: string): boolean {
  const a = skeleton(input)
  const b = skeleton(corrected)
  if (!b) return false
  const wa = a ? a.split(' ').length : 0
  const wb = b.split(' ').length
  if (Math.abs(wa - wb) > Math.max(1, Math.round(wa * 0.2))) return false
  return editDistance(a, b) <= Math.max(2, Math.round(a.length * 0.25))
}

// ------------------------------------------------------------------------ small in-memory state

const cache = new Map<string, CorrectReply>()
const hits = new Map<string, number[]>()
let instanceDay = { day: -1, count: 0 }

function cacheGet(key: string): CorrectReply | undefined {
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit)
  }
  return hit
}
function cacheSet(key: string, value: CorrectReply): void {
  cache.set(key, value)
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!)
}

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
export function resetCorrectState(): void {
  cache.clear()
  hits.clear()
  instanceDay = { day: -1, count: 0 }
}

const fail = (status: number, error: CorrectErrorCode, extra?: Record<string, string>) =>
  json(status, { error }, extra)

/** The model's `corrected` → one clean line (quotes it may wrap the sentence in are dropped). */
function readCorrected(answer: unknown): string | null {
  if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) return null
  const raw = (answer as Record<string, unknown>).corrected
  if (typeof raw !== 'string') return null
  return cleanText(raw.trim().replace(/^["“'](.*)["”']$/su, '$1'))
}

// ---------------------------------------------------------------------------------- handler

export async function handleCorrect(req: Request, deps: MotionDeps): Promise<Response> {
  const cfg = readCorrectConfig(deps.env)
  const enabled = cfg !== null && cfg.enabled
  if (req.method === 'GET' || req.method === 'HEAD') return json(200, { enabled, v: CORRECT_PROMPT_VERSION })
  if (req.method !== 'POST') return fail(405, 'bad_request', { Allow: 'GET, POST' })
  if (!cfg || !enabled) return fail(503, 'not_configured')
  if (!originAllowed(req, deps.env)) return fail(403, 'forbidden')
  if (!(req.headers.get('content-type') ?? '').toLowerCase().includes('application/json'))
    return fail(415, 'bad_request')

  const raw = await req.text().catch(() => '')
  if (!raw || new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return fail(400, 'bad_request')
  let body: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      return fail(400, 'bad_request')
    body = parsed as Record<string, unknown>
  } catch {
    return fail(400, 'bad_request')
  }
  const text = cleanText(body.text)
  if (!text) return fail(400, 'bad_request')
  const source: CorrectSource = SOURCES.has(body.source as CorrectSource)
    ? (body.source as CorrectSource)
    : 'asr'

  const key = `${CORRECT_PROMPT_VERSION}|${cfg.model}|${source}|${text}`
  const cached = cacheGet(key)
  if (cached) return json(200, cached)

  const wait = rateLimit(clientIp(req), (deps.now ?? Date.now)())
  if (wait !== null) return fail(429, 'rate_limited', { 'Retry-After': String(wait) })

  try {
    const answer = await qwenChat(cfg, buildMessages(text, source), {
      fetch: deps.fetch,
      timeoutMs: TIMEOUT_MS,
      temperature: TEMPERATURE,
    })
    const corrected = readCorrected(parseAnswer(answer.content))
    if (!corrected) {
      console.warn('[correct] the model returned no usable sentence')
      return fail(502, 'bad_output')
    }
    const reply: CorrectReply = plausibleCorrection(text, corrected)
      ? { corrected, changed: corrected !== text }
      : { corrected: text, changed: false, rejected: true }
    cacheSet(key, reply)
    return json(200, reply)
  } catch (err) {
    if (err instanceof QwenError) {
      console.warn(`[correct] Qwen call failed: ${err.kind}${err.status ? ` ${err.status}` : ''}`)
      if (err.kind === 'timeout') return fail(504, 'timeout')
      if (err.kind === 'rate_limited') return fail(503, 'rate_limited', { 'Retry-After': '30' })
      return fail(502, 'upstream')
    }
    console.error('[correct] unexpected failure', err instanceof Error ? err.name : typeof err)
    return fail(500, 'upstream')
  }
}
