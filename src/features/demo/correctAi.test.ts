import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDemo } from '@/store/demoStore'
import { correctionAvailable, requestCorrection, resetCorrectAi } from './correctAi'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const as = (f: unknown) => f as typeof fetch

beforeEach(() => {
  resetCorrectAi()
  useDemo.setState({ correction: 'unknown' })
})

describe('correctionAvailable', () => {
  it('asks GET /api/correct once and stores the answer', async () => {
    const f = vi.fn(async () => json({ enabled: true, v: 1 }))
    expect(await correctionAvailable(as(f))).toBe(true)
    expect(await correctionAvailable(as(f))).toBe(true)
    expect(f).toHaveBeenCalledTimes(1)
    expect(useDemo.getState().correction).toBe('on')
  })

  it('off on a 404 (static host) or a network error', async () => {
    expect(await correctionAvailable(as(vi.fn(async () => new Response('', { status: 404 }))))).toBe(false)
    expect(useDemo.getState().correction).toBe('off')
    resetCorrectAi()
    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await correctionAvailable(as(down))).toBe(false)
  })
})

describe('requestCorrection', () => {
  it('POSTs {text, source} as JSON and returns the correction (cached afterwards)', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ corrected: 'bật đèn lên', changed: true }),
    )
    expect(await requestCorrection('bat den len', 'text', { fetchImpl: as(f) })).toEqual({
      kind: 'ok',
      corrected: 'bật đèn lên',
      changed: true,
    })
    const [url, init] = f.mock.calls[0]!
    expect(url).toBe('/api/correct')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ text: 'bat den len', source: 'text' })
    await requestCorrection('bat den len', 'text', { fetchImpl: as(f) })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it.each([
    [json({ error: 'rate_limited' }, 429), 'rate_limited'],
    [json({ error: 'rate_limited' }, 503), 'rate_limited'],
    [json({ error: 'timeout' }, 504), 'timeout'],
    [json({ error: 'bad_output' }, 502), 'server'],
    [json({ nope: 1 }), 'server'],
  ])('maps %# to an error (never throws)', async (response, reason) => {
    const f = vi.fn(async () => response)
    expect(await requestCorrection('a b', 'asr', { fetchImpl: as(f) })).toEqual({ kind: 'error', reason })
  })

  it('switches the step off when the server says not_configured', async () => {
    useDemo.setState({ correction: 'on' })
    const f = vi.fn(async () => json({ error: 'not_configured' }, 503))
    await requestCorrection('a b', 'asr', { fetchImpl: as(f) })
    expect(useDemo.getState().correction).toBe('off')
  })

  it('times out and honours the caller signal', async () => {
    vi.useFakeTimers()
    const hang = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    const p = requestCorrection('x y', 'asr', { fetchImpl: as(hang), timeoutMs: 1000 })
    await vi.advanceTimersByTimeAsync(1001)
    expect(await p).toEqual({ kind: 'error', reason: 'timeout' })
    vi.useRealTimers()

    const ctrl = new AbortController()
    const q = requestCorrection('x z', 'asr', { fetchImpl: as(hang), signal: ctrl.signal })
    ctrl.abort()
    expect(await q).toEqual({ kind: 'error', reason: 'aborted' })
  })
})
