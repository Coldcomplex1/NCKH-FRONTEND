import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleCorrect, plausibleCorrection, resetCorrectState, skeleton } from './correctHandler'
import { SYSTEM_PROMPT } from './correctPrompt'
import type { MotionEnv } from './motionHandler'

const ORIGIN = 'https://robot.example.org'
const ENV: MotionEnv = { DASHSCOPE_API_KEY: 'test-key' }

const completion = (content: string, status = 200) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
const corrected = (text: string) => completion(JSON.stringify({ corrected: text }))

function post(body: unknown, init: { origin?: string | null; ip?: string; type?: string } = {}) {
  const headers = new Headers({ 'Content-Type': init.type ?? 'application/json', Host: 'robot.example.org' })
  if (init.origin !== null) headers.set('Origin', init.origin ?? ORIGIN)
  headers.set('X-Forwarded-For', init.ip ?? '203.0.113.7')
  return new Request(`${ORIGIN}/api/correct`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function fakeFetch(...answers: Response[]) {
  let i = 0
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    answers[Math.min(i++, answers.length - 1)]!.clone(),
  )
}

const call = (req: Request, fetch: ReturnType<typeof fakeFetch>, env: MotionEnv = ENV) =>
  handleCorrect(req, { env, fetch: fetch as unknown as typeof globalThis.fetch })

beforeEach(() => resetCorrectState())

describe('GET /api/correct', () => {
  it('is on with a key, off without one or with the kill switch', async () => {
    const get = new Request(`${ORIGIN}/api/correct`)
    const f = fakeFetch(corrected('x'))
    expect(await (await call(get, f, {})).json()).toMatchObject({ enabled: false })
    expect(await (await call(get, f)).json()).toMatchObject({ enabled: true })
    expect(await (await call(get, f, { ...ENV, CORRECT_AI_ENABLED: 'false' })).json()).toMatchObject({
      enabled: false,
    })
    expect(f).not.toHaveBeenCalled()
  })
})

describe('POST /api/correct', () => {
  it('asks Qwen (JSON mode, no thinking, low temperature) and returns the correction', async () => {
    const f = fakeFetch(corrected('Nhảy ba lần rồi vẫy tay.'))
    const res = await call(post({ text: 'Nhảy ba lần rồi vây tay.', source: 'asr' }), f)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ corrected: 'Nhảy ba lần rồi vẫy tay.', changed: true })

    const [url, init] = f.mock.calls[0]!
    expect(String(url)).toBe('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions')
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(body).toMatchObject({
      model: 'qwen3.7-plus',
      response_format: { type: 'json_object' },
      enable_thinking: false,
      temperature: 0.1,
    })
    const messages = body.messages as { role: string; content: string }[]
    expect(messages[0]).toEqual({ role: 'system', content: SYSTEM_PROMPT })
    expect(JSON.parse(messages[1]!.content)).toEqual({ source: 'asr', text: 'Nhảy ba lần rồi vây tay.' })
  })

  it('uses QWEN_CORRECT_MODEL when set, even with QWEN_THINKING on', async () => {
    const f = fakeFetch(corrected('bật đèn lên'))
    await call(post({ text: 'bat den len', source: 'text' }), f, {
      ...ENV,
      QWEN_MODEL: 'qwen-big',
      QWEN_CORRECT_MODEL: 'qwen-fast',
      QWEN_THINKING: 'true',
    })
    const body = JSON.parse(String(f.mock.calls[0]![1]?.body)) as Record<string, unknown>
    expect(body).toMatchObject({ model: 'qwen-fast', enable_thinking: false })
    expect(body.stream).toBeUndefined()
  })

  it('reports "unchanged" when there is nothing to fix', async () => {
    const f = fakeFetch(corrected('Chừ mấy giờ rồi rứa.'))
    const res = await call(post({ text: 'Chừ mấy giờ rồi rứa.', source: 'asr' }), f)
    expect(await res.json()).toEqual({ corrected: 'Chừ mấy giờ rồi rứa.', changed: false })
  })

  it('refuses a rewrite (dialect translated to standard Vietnamese) and keeps the input', async () => {
    const f = fakeFetch(corrected('Bây giờ mấy giờ rồi vậy.'))
    const res = await call(post({ text: 'Chừ mấy giờ rồi rứa.', source: 'asr' }), f)
    expect(await res.json()).toEqual({ corrected: 'Chừ mấy giờ rồi rứa.', changed: false, rejected: true })
  })

  it('drops quotes the model wraps the sentence in', async () => {
    const f = fakeFetch(corrected('“bật quạt lên coi”'))
    const res = await call(post({ text: 'bat quat len coi', source: 'text' }), f)
    expect(await res.json()).toEqual({ corrected: 'bật quạt lên coi', changed: true })
  })

  it('caches: the same text is corrected once per instance', async () => {
    const f = fakeFetch(corrected('bật đèn lên'))
    await call(post({ text: 'bat den len', source: 'text' }), f)
    await call(post({ text: 'bat den len', source: 'text' }), f, ENV)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('502 when the model returns no usable sentence', async () => {
    const f = fakeFetch(completion('I cannot help with that'))
    const res = await call(post({ text: 'bat den len' }), f)
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'bad_output' })
  })

  it.each([
    ['another origin', post({ text: 'x' }, { origin: 'https://evil.example' }), 403],
    ['no origin', post({ text: 'x' }, { origin: null }), 403],
    ['not JSON', post('text=x', { type: 'application/x-www-form-urlencoded' }), 415],
    ['no text', post({ source: 'asr' }), 400],
    ['text too long', post({ text: 'a'.repeat(201) }), 400],
    ['a body over 1 KB', post({ text: 'a', pad: 'x'.repeat(1100) }), 400],
  ])('rejects %s', async (_label, req, status) => {
    const f = fakeFetch(corrected('x'))
    expect((await call(req, f)).status).toBe(status)
    expect(f).not.toHaveBeenCalled()
  })

  it('503 not_configured without a key', async () => {
    const res = await call(post({ text: 'bat den len' }), fakeFetch(corrected('x')), {})
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'not_configured' })
  })

  it('rate-limits each visitor (20 a minute)', async () => {
    const f = fakeFetch(corrected('bật đèn lên'))
    for (let i = 0; i < 20; i++) {
      expect((await call(post({ text: `bat den len ${i}` }), f)).status).toBe(200)
    }
    const res = await call(post({ text: 'bat den len 21' }), f)
    expect(res.status).toBe(429)
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect((await call(post({ text: 'bat den len 22' }, { ip: '198.51.100.1' }), f)).status).toBe(200)
  })

  it('maps upstream failures', async () => {
    expect((await call(post({ text: 'a b' }), fakeFetch(completion('', 401)))).status).toBe(502)
    resetCorrectState()
    const limited = await call(post({ text: 'a b' }), fakeFetch(completion('', 429)))
    expect(limited.status).toBe(503)
    expect(await limited.json()).toEqual({ error: 'rate_limited' })
  })
})

describe('plausibleCorrection', () => {
  it('accepts restored diacritics and a misheard word or two', () => {
    expect(plausibleCorrection('bat den len', 'bật đèn lên')).toBe(true)
    expect(plausibleCorrection('chu may gio roi rua', 'chừ mấy giờ rồi rứa')).toBe(true)
    expect(plausibleCorrection('Nhảy ba lần rồi vây tay.', 'Nhảy ba lần rồi vẫy tay.')).toBe(true)
    expect(plausibleCorrection('bậc quạt lên', 'bật quạt lên')).toBe(true)
  })

  it('refuses translations and paraphrases', () => {
    expect(plausibleCorrection('chừ mấy giờ rồi rứa', 'bây giờ mấy giờ rồi vậy')).toBe(false)
    expect(plausibleCorrection('mần răng rứa', 'làm sao vậy')).toBe(false)
    expect(plausibleCorrection('nhảy lên', 'Robot hãy nhảy lên thật cao nhé')).toBe(false)
    expect(plausibleCorrection('nhảy lên', '')).toBe(false)
  })

  it('skeleton drops diacritics, đ and punctuation', () => {
    expect(skeleton('Đèn, bật lên!')).toBe('den bat len')
  })
})
