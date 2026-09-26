import { ENV } from '@/lib/env'
import { storage } from '@/lib/storage'
import { MOTION_PROMPT_VERSION, normalizeMotion } from '@/motion/script'
import { demo } from '@/store/demoStore'
import type { Escalation, MoveResult } from './escalate'

/**
 * Browser side of AI-invented moves: asks the site's /api/motion (the Vercel function that holds
 * the Qwen key) to invent a move for one clause. Everything it returns is validated again here.
 *
 * - Availability: one GET per page load; the feature is off (today's behaviour) unless the server
 *   says `enabled` — a static host (Netlify, `vite preview`) answers 404 and stays off.
 * - Cache: moves this browser already got are replayed instantly (localStorage, versioned, 50 max).
 * - Dev-only mock (VITE_MOTION_MOCK=true): canned moves, no key needed; never in a production build.
 */

let availability: Promise<boolean> | null = null

export function motionAiAvailable(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (import.meta.env.DEV && ENV.motion.mock) {
    demo().setAiMoves('on')
    return Promise.resolve(true)
  }
  availability ??= fetchImpl(ENV.motion.url, { headers: { Accept: 'application/json' } })
    .then(async (res) => res.ok && ((await res.json()) as { enabled?: unknown }).enabled === true)
    .catch(() => false)
    .then((on) => {
      demo().setAiMoves(on ? 'on' : 'off')
      return on
    })
  return availability
}

/** Called once on app start, like prefetchParser(). */
export function prefetchMotionAi(): void {
  void motionAiAvailable()
}

// ---------------------------------------------------------------------------------- cache

const CACHE_KEY = 'nckh:ai-moves'
const CACHE_MAX = 50

type Stored = { v: number; entries: Record<string, { r: MoveResult; at: number }> }

const keyOf = (e: Escalation) =>
  `${e.kind}|${e.hint ?? ''}|${e.text
    .toLowerCase()
    .replace(/[.!?,…]+$/u, '')
    .trim()}`

function readCache(): Stored['entries'] {
  try {
    const parsed = JSON.parse(storage.get(CACHE_KEY) ?? 'null') as Stored | null
    return parsed && parsed.v === MOTION_PROMPT_VERSION && typeof parsed.entries === 'object'
      ? parsed.entries
      : {}
  } catch {
    return {}
  }
}

function writeCache(entries: Stored['entries']): void {
  const keep = Object.entries(entries)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, CACHE_MAX)
  storage.set(CACHE_KEY, JSON.stringify({ v: MOTION_PROMPT_VERSION, entries: Object.fromEntries(keep) }))
}

/** A move this browser already has for this clause (re-validated), or null. */
export function cachedMove(e: Escalation): MoveResult | null {
  const hit = readCache()[keyOf(e)]?.r
  if (!hit) return null
  if (hit.kind === 'not_motion' || hit.kind === 'refused') return hit
  if (hit.kind !== 'move') return null
  const r = normalizeMotion(hit.move)
  return r.ok ? { kind: 'move', move: r.move } : null
}

function remember(e: Escalation, r: MoveResult): void {
  if (r.kind === 'error') return
  const entries = readCache()
  entries[keyOf(e)] = { r, at: Date.now() }
  writeCache(entries)
}

// ---------------------------------------------------------------------------------- request

export interface RequestMoveOptions {
  signal?: AbortSignal
  /** The whole command, for context. */
  utterance?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

/** Asks for one move. Never rejects: failures come back as `{ kind: 'error', reason }`. */
export async function requestMove(e: Escalation, opts: RequestMoveOptions = {}): Promise<MoveResult> {
  const hit = cachedMove(e)
  if (hit) return hit
  if (import.meta.env.DEV && ENV.motion.mock) {
    const { mockMove } = await import('./motionMock')
    return mockMove(e, opts.signal)
  }
  const ac = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    ac.abort()
  }, opts.timeoutMs ?? ENV.motion.timeoutMs)
  const onAbort = () => ac.abort()
  opts.signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const res = await (opts.fetchImpl ?? fetch)(ENV.motion.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ clause: e.text, utterance: opts.utterance, hint: e.hint, kind: e.kind }),
      signal: ac.signal,
    })
    if (res.status === 503) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (body?.error === 'not_configured') {
        demo().setAiMoves('off')
        availability = Promise.resolve(false)
        return { kind: 'error', reason: 'disabled' }
      }
      return { kind: 'error', reason: body?.error === 'rate_limited' ? 'rate_limited' : 'server' }
    }
    if (res.status === 429) return { kind: 'error', reason: 'rate_limited' }
    if (res.status === 504) return { kind: 'error', reason: 'timeout' }
    if (!res.ok) return { kind: 'error', reason: 'server' }
    const body = (await res.json()) as { kind?: string; move?: unknown }
    let result: MoveResult
    if (body.kind === 'not_motion') result = { kind: 'not_motion' }
    else if (body.kind === 'refused') result = { kind: 'refused' }
    else if (body.kind === 'move') {
      const r = normalizeMotion(body.move)
      if (!r.ok) return { kind: 'error', reason: 'server' }
      result = { kind: 'move', move: r.move }
    } else return { kind: 'error', reason: 'server' }
    remember(e, result)
    return result
  } catch {
    if (opts.signal?.aborted) return { kind: 'error', reason: 'aborted' }
    return { kind: 'error', reason: timedOut ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onAbort)
  }
}

/** Test helper: forget the availability check. */
export function resetMotionAi(): void {
  availability = null
}
