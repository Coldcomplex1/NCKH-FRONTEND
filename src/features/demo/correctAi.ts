import { ENV } from '@/lib/env'
import { demo } from '@/store/demoStore'

/**
 * Browser side of the Qwen post-correction step: asks the site's /api/correct (the Vercel function
 * that holds the Qwen key) to fix recognition / typing errors in one command.
 *
 * - Availability: one GET per page load; off (the stage stays "sắp có") unless the server says
 *   `enabled` — a static host (Netlify, `vite preview`) answers 404 and stays off.
 * - Never rejects: on any failure the pipeline acts on the uncorrected text.
 * - Corrections this page already got are reused (in memory, 100 max).
 */

export type CorrectSource = 'asr' | 'text'

export type CorrectionResult =
  | { kind: 'ok'; corrected: string; changed: boolean }
  | { kind: 'error'; reason: 'aborted' | 'timeout' | 'network' | 'rate_limited' | 'server' }

let availability: Promise<boolean> | null = null

export function correctionAvailable(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  availability ??= fetchImpl(ENV.correct.url, { headers: { Accept: 'application/json' } })
    .then(async (res) => res.ok && ((await res.json()) as { enabled?: unknown }).enabled === true)
    .catch(() => false)
    .then((on) => {
      demo().setCorrection(on ? 'on' : 'off')
      return on
    })
  return availability
}

/** Called once on app start, like prefetchMotionAi(). */
export function prefetchCorrection(): void {
  void correctionAvailable()
}

const CACHE_MAX = 100
const cache = new Map<string, { corrected: string; changed: boolean }>()

export interface RequestCorrectionOptions {
  signal?: AbortSignal
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export async function requestCorrection(
  text: string,
  source: CorrectSource,
  opts: RequestCorrectionOptions = {},
): Promise<CorrectionResult> {
  const key = `${source}|${text}`
  const hit = cache.get(key)
  if (hit) return { kind: 'ok', ...hit }
  const ac = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    ac.abort()
  }, opts.timeoutMs ?? ENV.correct.timeoutMs)
  const onAbort = () => ac.abort()
  opts.signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const res = await (opts.fetchImpl ?? fetch)(ENV.correct.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ text, source }),
      signal: ac.signal,
    })
    if (res.status === 503) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (body?.error === 'not_configured') {
        demo().setCorrection('off')
        availability = Promise.resolve(false)
      }
      return { kind: 'error', reason: body?.error === 'rate_limited' ? 'rate_limited' : 'server' }
    }
    if (res.status === 429) return { kind: 'error', reason: 'rate_limited' }
    if (res.status === 504) return { kind: 'error', reason: 'timeout' }
    if (!res.ok) return { kind: 'error', reason: 'server' }
    const body = (await res.json()) as { corrected?: unknown; changed?: unknown }
    if (typeof body.corrected !== 'string' || !body.corrected.trim())
      return { kind: 'error', reason: 'server' }
    const result = { corrected: body.corrected.trim(), changed: body.changed === true }
    cache.set(key, result)
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!)
    return { kind: 'ok', ...result }
  } catch {
    if (opts.signal?.aborted) return { kind: 'error', reason: 'aborted' }
    return { kind: 'error', reason: timedOut ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onAbort)
  }
}

/** Test helper: forget the availability check and the cache. */
export function resetCorrectAi(): void {
  availability = null
  cache.clear()
}
