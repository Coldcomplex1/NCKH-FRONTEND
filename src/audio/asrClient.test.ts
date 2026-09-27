import { afterEach, describe, expect, it, vi } from 'vitest'
import { AsrError, checkHealth, parseRetryAfter, readDetail, transcribe, uploadFilename } from './asrClient'

const BASE = 'https://asr.example.org'
const wav = () => new Blob([new Uint8Array(64)], { type: 'audio/wav' })

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })

/** Run transcribe and return the AsrError it throws. */
async function failure(p: Promise<unknown>): Promise<AsrError> {
  const err = await p.then(
    () => new Error('expected transcribe to throw'),
    (e: unknown) => e,
  )
  if (!(err instanceof AsrError)) throw err
  return err
}

afterEach(() => {
  vi.useRealTimers()
})

describe('transcribe', () => {
  it('POSTs FormData field "file" to {base}/transcribe with no custom headers, and returns the body', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      json({ text: 'chừ mấy giờ rồi rứa', duration: 2.4, corrected_text: 'bây giờ mấy giờ rồi vậy' }),
    )
    const res = await transcribe(wav(), { baseUrl: `${BASE}/`, fetchImpl: fetchImpl as typeof fetch })
    expect(res).toEqual({
      text: 'chừ mấy giờ rồi rứa',
      duration: 2.4,
      corrected_text: 'bây giờ mấy giờ rồi vậy',
    })

    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe(`${BASE}/transcribe`) // trailing slash stripped
    expect(init?.method).toBe('POST')
    expect(init?.headers).toBeUndefined() // CORS simple request: no preflight
    const form = init?.body as FormData
    expect(form).toBeInstanceOf(FormData)
    const file = form.get('file') as File
    expect(file).toBeInstanceOf(Blob)
    expect(file.name).toBe('recording.wav')
  })

  it('strips several trailing slashes', async () => {
    const fetchImpl = vi.fn(async () => json({ text: 'ok' }))
    await transcribe(wav(), { baseUrl: `${BASE}///`, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect((fetchImpl.mock.calls[0] as unknown[])[0]).toBe(`${BASE}/transcribe`)
  })

  it('keeps optional alternatives and drops empty corrected_text', async () => {
    const fetchImpl = vi.fn(async () =>
      json({ text: 'a', corrected_text: '  ', alternatives: ['a', '', 3, 'b'] }),
    )
    const res = await transcribe(wav(), { baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(res).toEqual({ text: 'a', alternatives: ['a', 'b'] })
  })

  it('bad_response when "text" is missing or the JSON is invalid', async () => {
    const missing = vi.fn(async () => json({ transcript: 'x' }))
    expect(
      (await failure(transcribe(wav(), { baseUrl: BASE, fetchImpl: missing as unknown as typeof fetch })))
        .kind,
    ).toBe('bad_response')
    const invalid = vi.fn(async () => new Response('not json', { status: 200 }))
    expect(
      (await failure(transcribe(wav(), { baseUrl: BASE, fetchImpl: invalid as unknown as typeof fetch })))
        .kind,
    ).toBe('bad_response')
  })

  it.each([
    [413, 'too_large'],
    [415, 'unsupported_media'],
    [422, 'unprocessable'],
    [500, 'http'],
  ] as const)('HTTP %i → %s with a string detail', async (status, kind) => {
    const fetchImpl = vi.fn(async () => json({ detail: 'nope' }, { status }))
    const err = await failure(
      transcribe(wav(), { baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch }),
    )
    expect(err.kind).toBe(kind)
    expect(err.status).toBe(status)
    expect(err.detail).toBe('nope')
  })

  it('reads FastAPI validation-array details', async () => {
    const fetchImpl = vi.fn(async () =>
      json(
        { detail: [{ loc: ['body', 'file'], msg: 'field required', type: 'missing' }, { msg: 'too long' }] },
        { status: 422 },
      ),
    )
    const err = await failure(
      transcribe(wav(), { baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch }),
    )
    expect(err.kind).toBe('unprocessable')
    expect(err.detail).toBe('field required; too long')
  })

  it('503 → busy with Retry-After seconds', async () => {
    const fetchImpl = vi.fn(async () =>
      json({ detail: 'warming up' }, { status: 503, headers: { 'Retry-After': '20' } }),
    )
    const err = await failure(
      transcribe(wav(), { baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch }),
    )
    expect(err.kind).toBe('busy')
    expect(err.retryAfterSec).toBe(20)
  })

  it('429 → busy with Retry-After seconds (rate limit, same as 503)', async () => {
    const fetchImpl = vi.fn(async () =>
      json({ detail: 'too many requests' }, { status: 429, headers: { 'Retry-After': '5' } }),
    )
    const err = await failure(
      transcribe(wav(), { baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch }),
    )
    expect(err.kind).toBe('busy')
    expect(err.retryAfterSec).toBe(5)
  })

  it('an http:// base URL is posted to as-is — this layer trusts its caller; the https-only gate is ENV.asr (see env.test.ts, CS-05)', async () => {
    const fetchImpl = vi.fn(async () => json({ text: 'ok' }))
    const res = await transcribe(wav(), {
      baseUrl: 'http://192.168.1.20:8000',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(res.text).toBe('ok')
    expect(fetchImpl).toHaveBeenCalledWith('http://192.168.1.20:8000/transcribe', expect.anything())
  })

  it('times out with fake timers', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    const p = transcribe(wav(), {
      baseUrl: BASE,
      timeoutMs: 5000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const assertion = failure(p)
    await vi.advanceTimersByTimeAsync(5001)
    expect((await assertion).kind).toBe('timeout')
  })

  it('caller abort → aborted (before and during the request)', async () => {
    const pre = new AbortController()
    pre.abort()
    const never = vi.fn()
    expect(
      (
        await failure(
          transcribe(wav(), {
            baseUrl: BASE,
            signal: pre.signal,
            fetchImpl: never as unknown as typeof fetch,
          }),
        )
      ).kind,
    ).toBe('aborted')
    expect(never).not.toHaveBeenCalled()

    const ctrl = new AbortController()
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    const p = transcribe(wav(), {
      baseUrl: BASE,
      signal: ctrl.signal,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    ctrl.abort()
    expect((await failure(p)).kind).toBe('aborted')
  })

  it('network TypeError (offline, CORS, mixed content) → network', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(
      (await failure(transcribe(wav(), { baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch })))
        .kind,
    ).toBe('network')
  })

  it('no base URL → disabled', async () => {
    expect((await failure(transcribe(wav(), { baseUrl: '  ' }))).kind).toBe('disabled')
  })
})

describe('checkHealth', () => {
  const health = (fetchImpl: unknown, timeoutMs?: number) =>
    checkHealth({ baseUrl: `${BASE}/`, fetchImpl: fetchImpl as typeof fetch, timeoutMs })

  it('GETs {base}/health with no custom headers and maps the status', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      json({ status: 'ok', model: 'best_model', device: 'cuda', public: true }),
    )
    expect(await health(fetchImpl)).toBe('ok')
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe(`${BASE}/health`)
    expect(init?.method ?? 'GET').toBe('GET')
    expect(init?.headers).toBeUndefined() // CORS simple request
    expect(await health(vi.fn(async () => json({ status: 'loading' })))).toBe('loading')
  })

  it.each([
    ['a model that failed to load', async () => json({ status: 'error' })],
    ['a tunnel with nothing behind it (502)', async () => new Response('Bad Gateway', { status: 502 })],
    ['a 503', async () => json({ detail: 'x' }, { status: 503 })],
    ['a body that is not JSON', async () => new Response('<html>', { status: 200 })],
    [
      'a network failure',
      async () => {
        throw new TypeError('Failed to fetch')
      },
    ],
  ])('offline for %s', async (_label, impl) => {
    expect(await health(vi.fn(impl))).toBe('offline')
  })

  it('offline after the timeout', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    const p = health(fetchImpl, 3000)
    await vi.advanceTimersByTimeAsync(3001)
    expect(await p).toBe('offline')
  })

  it('offline without a base URL (never fetches)', async () => {
    const fetchImpl = vi.fn()
    expect(await checkHealth({ baseUrl: ' ', fetchImpl: fetchImpl as unknown as typeof fetch })).toBe(
      'offline',
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('helpers', () => {
  it('uploadFilename', () => {
    expect(uploadFilename(new Blob([], { type: 'audio/wav' }))).toBe('recording.wav')
    expect(uploadFilename(new Blob([], { type: 'audio/webm;codecs=opus' }))).toBe('recording.webm')
    expect(uploadFilename(new File([], 'loi-noi.m4a', { type: 'audio/mp4' }))).toBe('loi-noi.m4a')
    expect(uploadFilename(new Blob([], { type: '' }))).toBe('recording.bin')
  })

  it('parseRetryAfter handles seconds and HTTP dates', () => {
    const now = Date.parse('2026-09-24T01:00:00Z')
    expect(parseRetryAfter('7')).toBe(7)
    expect(parseRetryAfter('Thu, 24 Sep 2026 01:00:30 GMT', now)).toBe(30)
    expect(parseRetryAfter(null)).toBeUndefined()
    expect(parseRetryAfter('soon')).toBeUndefined()
  })

  it('readDetail', () => {
    expect(readDetail({ detail: 'x' })).toBe('x')
    expect(readDetail({ detail: [{ msg: 'a' }, 'b'] })).toBe('a; b')
    expect(readDetail({ detail: [] })).toBeUndefined()
    expect(readDetail(null)).toBeUndefined()
  })
})
