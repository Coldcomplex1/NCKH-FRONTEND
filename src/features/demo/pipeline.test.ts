import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Action } from '@/core/actions'
import type { EngineOutcome, EngineRequest } from '@/core/engine'
import type { ParseContext, ParseOptions, ParseResult } from '@/core/parser'
import { INITIAL_STAGES, useDemo } from '@/store/demoStore'

const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  submit: vi.fn(),
  think: vi.fn(),
  prime: vi.fn(),
  transcribe: vi.fn(),
  toWav16k: vi.fn(),
  aiAvailable: vi.fn(),
  cachedMove: vi.fn(),
  requestMove: vi.fn(),
}))

vi.mock('@/nlu', () => ({
  getParser: () => ({
    id: 'mock',
    parse: (text: string, ctx: ParseContext, opts?: ParseOptions) => mocks.parse(text, ctx, opts),
  }),
}))
vi.mock('@/engine', () => ({
  engine: {
    submit: (req: EngineRequest) => mocks.submit(req),
    think: (turnId: string) => mocks.think(turnId),
    interrupt: () => {},
    cancelTimer: () => {},
    returnHome: () => {},
  },
}))
vi.mock('@/speech', () => ({
  speaker: {
    supported: true,
    prime: () => mocks.prime(),
    status: () => 'ok',
    onVoicesChanged: () => () => {},
    speak: async () => 'ended',
    cancel: () => {},
  },
}))
vi.mock('@/lib/env', () => ({
  ENV: {
    asr: { url: 'https://asr.test', enabled: true, mock: false, timeoutMs: 1000, maxUploadMB: 10 },
    nlu: { engine: 'rules', url: '' },
  },
}))
vi.mock('@/audio/asrClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/audio/asrClient')>()),
  transcribe: (...args: unknown[]) => mocks.transcribe(...args),
}))
vi.mock('@/audio/decode', () => ({ toWav16k: (...args: unknown[]) => mocks.toWav16k(...args) }))
vi.mock('./motionAi', () => ({
  motionAiAvailable: () => mocks.aiAvailable(),
  cachedMove: (...args: unknown[]) => mocks.cachedMove(...args),
  requestMove: (...args: unknown[]) => mocks.requestMove(...args),
}))

const { AsrError } = await import('@/audio/asrClient')
const { THINKING: BUILTIN_THINKING } = await import('@/motion/builtins')
const { buildParseContext, DUPLICATE_WINDOW_MS, prefetchParser, resetPipeline, submitAudio, submitCommand } =
  await import('./pipeline')
// The parser is a lazy chunk; the app prefetches it after first paint, so tests start with it loaded.
await prefetchParser()

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function result(text: string, actions: Action[], extra: Partial<ParseResult> = {}): ParseResult {
  return {
    parser: 'mock',
    input: text,
    normalizedText: text,
    coreText: text,
    inputMode: 'accented',
    substitutions: [],
    dialectHints: {},
    clauses: [],
    actions: actions.map((action, clause) => ({
      action,
      confidence: 1,
      matched: text,
      clause,
      source: 'rule',
    })),
    unknown: [],
    suggestions: [],
    confidence: actions.length ? 1 : 0,
    notes: [],
    status: actions.length ? 'ok' : 'unknown',
    elapsedMs: 1,
    ...extra,
  }
}

const done: EngineOutcome = { status: 'done', replies: [] }
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  resetPipeline()
  useDemo.setState({ turns: [], stages: { ...INITIAL_STAGES }, lastActions: [], live: null, bubble: null })
  mocks.parse.mockImplementation(async (text: string) => result(text, [{ type: 'jump', count: 1 }]))
  mocks.submit.mockImplementation(async () => done)
  mocks.think.mockImplementation(() => {})
  mocks.aiAvailable.mockImplementation(async () => true)
  mocks.cachedMove.mockImplementation(() => null)
  mocks.requestMove.mockImplementation(async () => ({ kind: 'not_motion' }))
  mocks.prime.mockImplementation(() => {})
  mocks.toWav16k.mockImplementation(async (blob: Blob) => ({
    blob,
    filename: 'recording.wav',
    durationSec: 1.5,
    converted: true,
  }))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('submitCommand', () => {
  it('primes speech synchronously, before any await and before parsing', () => {
    void submitCommand('nhảy lên')
    expect(mocks.prime).toHaveBeenCalledTimes(1)
    expect(mocks.parse).toHaveBeenCalledTimes(1)
    expect(mocks.prime.mock.invocationCallOrder[0]!).toBeLessThan(mocks.parse.mock.invocationCallOrder[0]!)
  })

  it('primes even when the submit is then ignored (empty text)', async () => {
    await expect(submitCommand('   ')).resolves.toEqual({ status: 'ignored' })
    expect(mocks.prime).toHaveBeenCalledTimes(1)
    expect(mocks.parse).not.toHaveBeenCalled()
  })

  it('walks the stages input → (asr skipped, qwen soon) → nlu → robot', async () => {
    const parse = deferred<ParseResult>()
    const engineRun = deferred<EngineOutcome>()
    mocks.parse.mockImplementation(() => parse.promise)
    mocks.submit.mockImplementation(() => engineRun.promise)

    const p = submitCommand('nhảy lên', 'chip')
    expect(useDemo.getState().stages).toEqual({
      input: 'done',
      asr: 'skipped',
      qwen: 'soon',
      nlu: 'active',
      robot: 'idle',
    })
    const turn = useDemo.getState().turns[0]!
    expect(turn).toMatchObject({ source: 'chip', heard: 'nhảy lên', status: 'processing' })

    parse.resolve(result('nhảy lên', [{ type: 'jump', count: 1 }]))
    await flush()
    expect(useDemo.getState().stages).toMatchObject({ nlu: 'done', robot: 'active' })
    expect(useDemo.getState().turns[0]!.parse?.input).toBe('nhảy lên')
    expect(mocks.submit).toHaveBeenCalledWith({
      turnId: turn.id,
      actions: [{ type: 'jump', count: 1 }],
      notes: [],
      hasUnknown: false,
      suggestions: [],
      lang: 'vi',
    })

    engineRun.resolve(done)
    await expect(p).resolves.toEqual({ status: 'done', turnId: turn.id })
    expect(useDemo.getState().stages.robot).toBe('done')
    expect(useDemo.getState().turns[0]!.status).toBe('done')
  })

  it('passes hasUnknown and suggestions through to the engine', async () => {
    mocks.parse.mockImplementation(async (text: string) =>
      result(text, [], {
        unknown: [{ text, clause: 0, reason: 'no_match' }],
        suggestions: [{ say: 'nhảy lên', label: { vi: 'Nhảy lên', en: 'Jump' } }],
      }),
    )
    await submitCommand('abc xyz')
    expect(mocks.submit.mock.calls[0]![0]).toMatchObject({
      actions: [],
      hasUnknown: true,
      suggestions: [{ say: 'nhảy lên' }],
    })
  })

  it('sets lastActions only when the parse produced actions', async () => {
    await submitCommand('nhảy lên')
    expect(useDemo.getState().lastActions).toEqual([{ type: 'jump', count: 1 }])

    mocks.parse.mockImplementation(async (text: string) => result(text, []))
    await submitCommand('ờ ờ')
    expect(useDemo.getState().lastActions).toEqual([{ type: 'jump', count: 1 }])
  })

  it('ignores an identical submit within 300 ms, accepts it afterwards', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-24T08:00:00+07:00'))
    const first = submitCommand('bật đèn')
    await expect(submitCommand('bật đèn')).resolves.toEqual({ status: 'ignored' })
    await first
    expect(mocks.parse).toHaveBeenCalledTimes(1)

    await expect(submitCommand('tắt đèn')).resolves.toMatchObject({ status: 'done' })
    vi.setSystemTime(Date.now() + DUPLICATE_WINDOW_MS + 1)
    await expect(submitCommand('tắt đèn')).resolves.toMatchObject({ status: 'done' })
    expect(mocks.parse).toHaveBeenCalledTimes(3)
  })

  it('a new submit aborts the previous parse; the stale turn never reaches the engine', async () => {
    const firstParse = deferred<ParseResult>()
    mocks.parse.mockImplementationOnce(() => firstParse.promise)

    const first = submitCommand('nhảy lên')
    const firstSignal = (mocks.parse.mock.calls[0]![2] as ParseOptions).signal!
    const firstId = useDemo.getState().turns[0]!.id
    expect(firstSignal.aborted).toBe(false)

    const second = submitCommand('ngồi xuống')
    expect(firstSignal.aborted).toBe(true)

    firstParse.resolve(result('nhảy lên', [{ type: 'jump', count: 1 }]))
    await expect(first).resolves.toEqual({ status: 'interrupted', turnId: firstId })
    await second
    expect(mocks.submit).toHaveBeenCalledTimes(1)
    expect(mocks.submit.mock.calls[0]![0]).toMatchObject({ actions: [{ type: 'jump', count: 1 }] })
    const turns = useDemo.getState().turns
    expect(turns.map((t) => t.status)).toEqual(['done', 'interrupted'])
    // Only the current turn drives the stages.
    expect(useDemo.getState().stages.robot).toBe('done')
  })

  it('parse errors mark the turn as error (shown in the card) without touching the bubble', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.parse.mockImplementation(async () => {
      throw new Error('boom')
    })
    const res = await submitCommand('nhảy lên')
    expect(res).toMatchObject({ status: 'error', error: 'generic' })
    const s = useDemo.getState()
    expect(s.turns[0]).toMatchObject({ status: 'error', error: 'generic' })
    expect(s.stages.nlu).toBe('error')
    expect(s.bubble).toBeNull()
    expect(s.live?.ref.key).toBe('error.generic')
    expect(mocks.submit).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('engine errors mark the turn as error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.submit.mockImplementation(async () => {
      throw new Error('engine down')
    })
    await expect(submitCommand('nhảy lên')).resolves.toMatchObject({ status: 'error' })
    expect(useDemo.getState().turns[0]!.status).toBe('error')
    expect(useDemo.getState().stages.robot).toBe('error')
    spy.mockRestore()
  })

  it('truncates input to 200 characters', async () => {
    await submitCommand('a'.repeat(250))
    expect((mocks.parse.mock.calls[0]![0] as string).length).toBe(200)
    expect(useDemo.getState().turns[0]!.heard.length).toBe(200)
  })

  it('builds the parse context from the stores', () => {
    useDemo.setState({ lastActions: [{ type: 'wave', count: 2 }] })
    const now = new Date('2026-09-24T08:35:00+07:00')
    const ctx = buildParseContext(now)
    expect(ctx).toMatchObject({
      now,
      lang: 'vi',
      robot: { posture: 'standing', activity: 'idle' },
      room: { light: { on: false, color: 'warm' }, fan: { on: false, speed: 2 } },
      lastActions: [{ type: 'wave', count: 2 }],
      timers: [],
      defaultPlace: { id: 'HoChiMinh' },
    })
  })
})

describe('submitAudio', () => {
  const audio = () => new Blob([new Uint8Array(32)], { type: 'audio/webm' })

  it('primes synchronously, runs ASR, then parses corrected_text with source "asr"', async () => {
    mocks.transcribe.mockImplementation(async () => ({
      text: 'bat quat len coi',
      corrected_text: 'bật quạt lên coi',
      duration: 1.6,
      alternatives: ['bật quạt lên coi'],
    }))
    const settled = vi.fn()
    const p = submitAudio(audio(), 'mic', { onAsrSettled: settled })
    expect(mocks.prime).toHaveBeenCalledTimes(1)
    expect(useDemo.getState().stages).toMatchObject({ input: 'done', asr: 'active', nlu: 'idle' })

    await p
    const turn = useDemo.getState().turns[0]!
    expect(turn.heard).toBe('bật quạt lên coi')
    expect(turn.asr).toMatchObject({
      raw: 'bat quat len coi',
      corrected: 'bật quạt lên coi',
      durationSec: 1.6,
    })
    expect(mocks.parse.mock.calls[0]![0]).toBe('bật quạt lên coi')
    expect(mocks.parse.mock.calls[0]![2]).toMatchObject({ source: 'asr', alternatives: ['bật quạt lên coi'] })
    expect(useDemo.getState().stages).toMatchObject({ asr: 'done', qwen: 'done', robot: 'done' })
    expect(settled).toHaveBeenCalledWith({ ok: true })
  })

  it('keeps Qwen "soon" when the backend returns no correction', async () => {
    mocks.transcribe.mockImplementation(async () => ({ text: 'nhảy lên' }))
    await submitAudio(audio(), 'file')
    expect(useDemo.getState().stages.qwen).toBe('soon')
    expect(useDemo.getState().turns[0]!.heard).toBe('nhảy lên')
  })

  it('maps ASR failures to the turn error and the asr stage', async () => {
    mocks.transcribe.mockImplementation(async () => {
      throw new AsrError('busy', { status: 503, retryAfterSec: 5 })
    })
    const settled = vi.fn()
    await expect(submitAudio(audio(), 'mic', { onAsrSettled: settled })).resolves.toMatchObject({
      status: 'error',
      error: 'asr.busy',
    })
    expect(useDemo.getState().turns[0]).toMatchObject({ status: 'error', error: 'asr.busy' })
    expect(useDemo.getState().stages.asr).toBe('error')
    expect(settled).toHaveBeenCalledWith({ ok: false, error: 'asr.busy' })
    expect(mocks.parse).not.toHaveBeenCalled()
  })

  it('an empty transcript is asr.empty', async () => {
    mocks.transcribe.mockImplementation(async () => ({ text: '   ' }))
    await expect(submitAudio(audio(), 'mic')).resolves.toMatchObject({ error: 'asr.empty' })
  })

  it('cancelling via the signal interrupts the turn', async () => {
    mocks.transcribe.mockImplementation(
      (_blob: Blob, opts: { signal: AbortSignal }) =>
        new Promise((_res, rej) => opts.signal.addEventListener('abort', () => rej(new AsrError('aborted')))),
    )
    const ctrl = new AbortController()
    const settled = vi.fn()
    const p = submitAudio(audio(), 'mic', { signal: ctrl.signal, onAsrSettled: settled })
    await flush()
    ctrl.abort()
    await expect(p).resolves.toMatchObject({ status: 'interrupted' })
    expect(settled).toHaveBeenCalledWith({ ok: false, cancelled: true })
    expect(useDemo.getState().stages.asr).toBe('idle')
  })
})

describe('AI moves (Qwen)', () => {
  const THINKING = BUILTIN_THINKING

  /** "lộn nhào đi": nothing the rules can do. */
  const unknownRoll = (text: string) =>
    result(text, [], {
      clauses: [{ text, negated: false, question: false, unexplained: ['lộn', 'nhào'], hasNegator: false }],
      unknown: [{ text, clause: 0, reason: 'no_match' }],
      status: 'unknown',
    })

  it('holds the thinking pose while Qwen invents the move, then performs it', async () => {
    mocks.parse.mockImplementation(async (text: string) => unknownRoll(text))
    const move = deferred<unknown>()
    mocks.requestMove.mockImplementation(() => move.promise)
    const p = submitCommand('lộn nhào đi')
    await flush()
    const turnId = useDemo.getState().turns[0]!.id
    expect(mocks.think).toHaveBeenCalledWith(turnId)
    expect(useDemo.getState().turns[0]!.creating).toBe(true)
    expect(useDemo.getState().stages.nlu).toBe('active')
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.requestMove.mock.calls[0]![0]).toMatchObject({ kind: 'unknown', text: 'lộn nhào đi' })

    move.resolve({ kind: 'move', move: THINKING })
    await p
    const req = mocks.submit.mock.calls[0]![0] as EngineRequest
    expect(req.actions).toEqual([{ type: 'custom_move', move: THINKING, count: 1 }])
    expect(req.hasUnknown).toBe(false)
    const turn = useDemo.getState().turns[0]!
    expect(turn.creating).toBe(false)
    expect(turn.parse?.actions[0]?.source).toBe('llm')
    expect(useDemo.getState().lastActions).toEqual(req.actions)
  })

  it('a move this browser already has plays at once (no thinking pose)', async () => {
    mocks.parse.mockImplementation(async (text: string) => unknownRoll(text))
    mocks.cachedMove.mockImplementation(() => ({ kind: 'move', move: THINKING }))
    await submitCommand('lộn nhào đi')
    expect(mocks.think).not.toHaveBeenCalled()
    expect(mocks.requestMove).not.toHaveBeenCalled()
    expect((mocks.submit.mock.calls[0]![0] as EngineRequest).actions[0]!.type).toBe('custom_move')
  })

  it('off (no key on this site): exactly the old behaviour', async () => {
    mocks.parse.mockImplementation(async (text: string) => unknownRoll(text))
    mocks.aiAvailable.mockImplementation(async () => false)
    await submitCommand('lộn nhào đi')
    expect(mocks.think).not.toHaveBeenCalled()
    const req = mocks.submit.mock.calls[0]![0] as EngineRequest
    expect(req.actions).toEqual([])
    expect(req.hasUnknown).toBe(true)
  })

  it('Qwen failing: the robot says it could not work the move out', async () => {
    mocks.parse.mockImplementation(async (text: string) => unknownRoll(text))
    mocks.requestMove.mockImplementation(async () => ({ kind: 'error', reason: 'timeout' }))
    await submitCommand('lộn nhào đi')
    expect((mocks.submit.mock.calls[0]![0] as EngineRequest).actions).toEqual([
      { type: 'clarify', need: 'move_failed' },
    ])
  })

  it('a new command while Qwen works supersedes the old turn (it never acts)', async () => {
    mocks.parse.mockImplementation(async (text: string) =>
      text === 'lộn nhào đi' ? unknownRoll(text) : result(text, [{ type: 'wave', count: 1 }]),
    )
    const slow = deferred<unknown>()
    mocks.requestMove.mockImplementation((_e: unknown, opts: { signal: AbortSignal }) => {
      opts.signal.addEventListener('abort', () => slow.resolve({ kind: 'error', reason: 'aborted' }))
      return slow.promise
    })
    const first = submitCommand('lộn nhào đi')
    await flush()
    const second = submitCommand('vẫy tay')
    expect((await first).status).toBe('interrupted')
    await second
    expect(mocks.submit).toHaveBeenCalledTimes(1)
    expect((mocks.submit.mock.calls[0]![0] as EngineRequest).actions[0]!.type).toBe('wave')
    const old = useDemo.getState().turns[1]!
    expect(old.status).toBe('interrupted')
    expect(old.creating).toBe(false)
  })
})
