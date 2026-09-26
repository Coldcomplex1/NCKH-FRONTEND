import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  handleMotion,
  resetMotionState,
  type MotionEnv,
} from './motionHandler'
import { SYSTEM_PROMPT } from './motionPrompt'

const ORIGIN = 'https://robot.example.org'
const ENV: MotionEnv = { DASHSCOPE_API_KEY: 'test-key' }

const MOVE = {
  kind: 'move',
  plan: 'crouch, roll forward, stand up',
  name: { vi: 'Lộn nhào', en: 'Somersault' },
  facing: 'right',
  gait: 'none',
  mood: null,
  loops: 1,
  duration: 2,
  travel: { forward: 0.7, right: 0 },
  keys: [
    { t: 0 },
    { t: 0.5, pose: { kneeL: [110], kneeR: [110] }, body: { pitch: 90 } },
    { t: 1.2, body: { pitch: 270 } },
    { t: 2, body: { pitch: 360 } },
  ],
}

/** An OpenAI-style chat completion whose message content is `content`. */
const completion = (content: string, status = 200) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

function post(body: unknown, init: { origin?: string | null; ip?: string; type?: string } = {}) {
  const headers = new Headers({ 'Content-Type': init.type ?? 'application/json', Host: 'robot.example.org' })
  if (init.origin !== null) headers.set('Origin', init.origin ?? ORIGIN)
  headers.set('X-Forwarded-For', init.ip ?? '203.0.113.7')
  return new Request(`${ORIGIN}/api/motion`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function fakeFetch(...answers: (Response | (() => Response | Promise<Response>))[]) {
  let i = 0
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    const a = answers[Math.min(i++, answers.length - 1)]!
    return typeof a === 'function' ? a() : a.clone()
  })
}

const call = (req: Request, fetch: ReturnType<typeof fakeFetch>, env: MotionEnv = ENV) =>
  handleMotion(req, { env, fetch: fetch as unknown as typeof globalThis.fetch })

beforeEach(() => resetMotionState())
afterEach(() => vi.useRealTimers())

describe('GET /api/motion', () => {
  it('reports whether the feature is on (a key is set and not switched off)', async () => {
    const get = new Request(`${ORIGIN}/api/motion`)
    const f = fakeFetch(completion('{}'))
    expect(await (await call(get, f, {})).json()).toMatchObject({ enabled: false })
    expect(await (await call(get, f)).json()).toMatchObject({ enabled: true })
    expect(await (await call(get, f, { ...ENV, MOTION_AI_ENABLED: 'false' })).json()).toMatchObject({
      enabled: false,
    })
    expect(f).not.toHaveBeenCalled()
  })
})

describe('POST /api/motion', () => {
  it('asks Qwen (JSON mode, thinking off) and returns the validated move', async () => {
    const f = fakeFetch(completion(JSON.stringify(MOVE)))
    const res = await call(post({ clause: 'lộn nhào đi', kind: 'unknown' }), f)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      kind: string
      move: { name: unknown; keys: unknown[]; facing: string }
    }
    expect(body.kind).toBe('move')
    expect(body.move.name).toEqual({ vi: 'Lộn nhào', en: 'Somersault' })
    expect(body.move.facing).toBe('right')
    expect(body.move.keys).toHaveLength(4)

    const [url, init] = f.mock.calls[0]!
    expect(url).toBe(`${DEFAULT_BASE_URL}/chat/completions`)
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer test-key')
    const sent = JSON.parse(init!.body as string)
    expect(sent).toMatchObject({
      model: DEFAULT_MODEL,
      response_format: { type: 'json_object' },
      enable_thinking: false,
    })
    expect(sent.stream).toBeUndefined()
    expect(sent.messages[0]).toEqual({ role: 'system', content: SYSTEM_PROMPT })
    expect(JSON.parse(sent.messages[1].content)).toEqual({ command: 'lộn nhào đi' })
  })

  it('honours QWEN_BASE_URL / QWEN_MODEL', async () => {
    const f = fakeFetch(completion(JSON.stringify(MOVE)))
    const env = {
      ...ENV,
      QWEN_BASE_URL: 'https://ws-1.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/',
      QWEN_MODEL: 'qwen3.8-flash',
    }
    await call(post({ clause: 'lộn nhào' }), f, env)
    expect(f.mock.calls[0]![0]).toBe(
      'https://ws-1.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions',
    )
    expect(JSON.parse(f.mock.calls[0]![1]!.body as string).model).toBe('qwen3.8-flash')
  })

  it('repairs an unusable answer once, then gives up', async () => {
    const broken = completion('{"kind":"move","keys":[{"t":0}]}')
    const repaired = fakeFetch(broken, completion(JSON.stringify(MOVE)))
    const ok = await call(post({ clause: 'moonwalk' }), repaired)
    expect(ok.status).toBe(200)
    expect(repaired).toHaveBeenCalledTimes(2)
    const second = JSON.parse(repaired.mock.calls[1]![1]!.body as string)
    expect(second.messages.at(-1).content).toMatch(/could not be used: .*at least 2 keyframes/)

    const hopeless = fakeFetch(broken, broken)
    const bad = await call(post({ clause: 'backflip' }), hopeless)
    expect(bad.status).toBe(502)
    expect(await bad.json()).toEqual({ error: 'bad_output' })
  })

  it('passes on "not a move" and refusals; tolerates code fences', async () => {
    const f1 = fakeFetch(completion('```json\n{"kind":"not_motion"}\n```'))
    expect(await (await call(post({ clause: 'thủ đô nước Pháp' }), f1)).json()).toEqual({
      kind: 'not_motion',
    })
    const f2 = fakeFetch(completion('{"kind":"refuse"}'))
    expect(await (await call(post({ clause: 'giơ ngón giữa' }), f2)).json()).toEqual({ kind: 'refused' })
  })

  it('drops a name that is not safe to show', async () => {
    const f = fakeFetch(completion(JSON.stringify({ ...MOVE, name: { vi: '<a href=x>', en: 'http://x.y' } })))
    const body = (await (await call(post({ clause: 'lộn' }), f)).json()) as { move: { name: unknown } }
    expect(body.move.name).toBeNull()
  })

  it('caches: the same clause is invented once per server instance', async () => {
    const f = fakeFetch(completion(JSON.stringify(MOVE)))
    await call(post({ clause: 'Lộn nhào!' }), f)
    const again = await call(post({ clause: 'lộn nhào' }, { ip: '198.51.100.1' }), f)
    expect(again.status).toBe(200)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('rejects other origins, non-JSON, oversized or empty requests', async () => {
    const f = fakeFetch(completion(JSON.stringify(MOVE)))
    expect((await call(post({ clause: 'x' }, { origin: 'https://evil.example' }), f)).status).toBe(403)
    expect((await call(post({ clause: 'x' }, { origin: null }), f)).status).toBe(403)
    expect((await call(post('clause=x', { type: 'application/x-www-form-urlencoded' }), f)).status).toBe(415)
    expect((await call(post({ clause: 'x'.repeat(3000) }), f)).status).toBe(400)
    expect((await call(post({ clause: '   ' }), f)).status).toBe(400)
    expect((await call(post('[1,2]'), f)).status).toBe(400)
    expect(f).not.toHaveBeenCalled()
    const allowed = await call(post({ clause: 'x' }, { origin: 'http://localhost:4173' }), f, {
      ...ENV,
      MOTION_ALLOWED_ORIGINS: 'http://localhost:4173',
    })
    expect(allowed.status).toBe(200)
  })

  it('is off without a key or with the kill switch', async () => {
    const f = fakeFetch(completion(JSON.stringify(MOVE)))
    expect((await call(post({ clause: 'x' }), f, {})).status).toBe(503)
    expect((await call(post({ clause: 'x' }), f, { ...ENV, MOTION_AI_ENABLED: 'false' })).status).toBe(503)
    expect(f).not.toHaveBeenCalled()
  })

  it('rate-limits one visitor (6 new moves a minute)', async () => {
    const f = fakeFetch(completion(JSON.stringify(MOVE)))
    for (let i = 0; i < 6; i++) expect((await call(post({ clause: `động tác ${i}` }), f)).status).toBe(200)
    const seventh = await call(post({ clause: 'động tác 7' }), f)
    expect(seventh.status).toBe(429)
    expect(Number(seventh.headers.get('Retry-After'))).toBeGreaterThan(0)
    // another visitor is not affected
    expect((await call(post({ clause: 'động tác 8' }, { ip: '198.51.100.9' }), f)).status).toBe(200)
  })

  it('maps upstream failures: timeout → 504, bad key → 502, Qwen busy → 503', async () => {
    vi.useFakeTimers()
    const hang = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
        ),
    )
    const pending = handleMotion(post({ clause: 'chậm quá' }), {
      env: ENV,
      fetch: hang as unknown as typeof fetch,
    })
    await vi.advanceTimersByTimeAsync(30_000)
    expect((await pending).status).toBe(504)
    vi.useRealTimers()

    expect((await call(post({ clause: 'a' }), fakeFetch(completion('', 401)))).status).toBe(502)
    const busy = await call(post({ clause: 'b' }), fakeFetch(completion('', 429)))
    expect(busy.status).toBe(503)
    expect(await busy.json()).toEqual({ error: 'rate_limited' })
  })
})

describe('the prompt', () => {
  it('asks for JSON (required by JSON mode) and documents every joint', () => {
    expect(SYSTEM_PROMPT).toContain('JSON')
    for (const j of ['torso', 'head', 'shoulderL', 'elbowL', 'hipL', 'kneeL', 'ankleL'])
      expect(SYSTEM_PROMPT).toContain(j)
  })
})
