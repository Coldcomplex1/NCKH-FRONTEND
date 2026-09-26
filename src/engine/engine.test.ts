import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Action } from '@/core/actions'
import type { EngineRequest } from '@/core/engine'
import type { Lang } from '@/core/lang'
import type { RenderedReply, ReplyRef } from '@/core/replies'
import type { SpeakResult } from '@/core/speech'
import type { WeatherData } from '@/core/weather'
import { THINKING } from '@/motion/builtins'
import { WeatherError } from '@/services/weather'
import { demo, useDemo } from '@/store/demoStore'
import { getPrefs, usePrefs } from '@/store/prefsStore'
import { controllerBridge } from './bridge'
import { ALARM_TITLE_PREFIX, createEngine, type EngineDeps, type EngineInstance } from './engine'
import { FakeController } from './fakeController'

const INITIAL = useDemo.getState()

const WEATHER: WeatherData = {
  current: { tempC: 31, feelsLikeC: 35, humidity: 70, windKmh: 9, precipitationMm: 0, code: 2, isDay: true },
  daily: [{ date: '2026-09-24', code: 61, maxC: 33, minC: 25, precipProbability: 80 }],
  fetchedAt: 0,
}

/** "vi:timer.done:uống thuốc": the key, plus the timer label when there is one. */
const refText = (ref: ReplyRef, lang: Lang) => {
  const label = (ref.params as { label?: string }).label
  return `${lang}:${ref.key}${label ? `:${label}` : ''}`
}

const render = (ref: ReplyRef, lang: Lang): RenderedReply => ({
  text: refText(ref, lang),
  speech: refText(ref, lang),
  tone: 'normal',
})

function fakeSpeaker(result: SpeakResult = 'ended', ms = 500) {
  const spoken: { text: string; lang: Lang }[] = []
  /** How each utterance ended, in order ('interrupted' = cut off). */
  const results: { text: string; result: SpeakResult }[] = []
  return {
    spoken,
    results,
    cancel: vi.fn(),
    speak: vi.fn((text: string, lang: Lang, opts?: { signal?: AbortSignal; onStart?: () => void }) => {
      spoken.push({ text, lang })
      opts?.onStart?.()
      return new Promise<SpeakResult>((resolve) => {
        const done = (r: SpeakResult) => {
          results.push({ text, result: r })
          resolve(r)
        }
        const t = setTimeout(() => done(result), ms)
        opts?.signal?.addEventListener('abort', () => {
          clearTimeout(t)
          done('interrupted')
        })
      })
    }),
  }
}

/** Every bubble and live-region message the store shows, as "key[:label]". */
function recordStore() {
  const bubbles: string[] = []
  const lives: string[] = []
  const text = (ref: ReplyRef) => refText(ref, 'vi').slice('vi:'.length)
  const unsub = useDemo.subscribe((s, prev) => {
    if (s.bubble && s.bubble.id !== prev.bubble?.id) bubbles.push(text(s.bubble.ref))
    if (s.live && s.live !== prev.live) lives.push(text(s.live.ref))
  })
  return { bubbles, lives, unsub }
}

let engine: EngineInstance
let ctrl: FakeController | null = null
let speaker: ReturnType<typeof fakeSpeaker>
let doc: {
  visibilityState: DocumentVisibilityState
  title: string
  /** Simulate a visibilitychange event. */
  fire(): void
} & Pick<EngineDeps['doc'] & object, 'addEventListener' | 'removeEventListener'>

function makeEngine(over: Partial<EngineDeps> = {}): EngineInstance {
  engine = createEngine({
    store: demo,
    subscribeStore: (cb) => useDemo.subscribe(cb),
    prefs: getPrefs,
    bridge: controllerBridge,
    speaker,
    render,
    fetchWeather: vi.fn(async () => WEATHER),
    beep: vi.fn(),
    primeAudio: vi.fn(),
    now: () => Date.now(),
    matches: () => false,
    doc,
    readyTimeoutMs: 10_000,
    projectWer: 0.0784,
    welcomed: true,
    ...over,
  })
  return engine
}

function attach(c = new FakeController()): FakeController {
  ctrl = c
  controllerBridge.attach(c)
  return c
}

let turnSeq = 0
function request(actions: Action[], over: Partial<EngineRequest> = {}): EngineRequest {
  const turnId = over.turnId ?? `t${++turnSeq}`
  demo().startTurn({ id: turnId, at: Date.now(), source: 'text', heard: '…' })
  return { turnId, actions, notes: [], hasUnknown: false, suggestions: [], lang: 'vi', ...over }
}

const turnKeys = (turnId: string) =>
  demo()
    .turns.find((t) => t.id === turnId)
    ?.replies.map((r) => r.key)
const bubbleKey = () => demo().bubble?.ref.key

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-24T03:00:00Z'))
  useDemo.setState(INITIAL, true)
  usePrefs.setState({ lang: 'vi', muted: false })
  speaker = fakeSpeaker()
  const listeners = new Set<() => void>()
  doc = {
    visibilityState: 'visible',
    title: 'Ronaldo',
    addEventListener: vi.fn((_type: 'visibilitychange', cb: () => void) => void listeners.add(cb)),
    removeEventListener: vi.fn((_type: 'visibilitychange', cb: () => void) => void listeners.delete(cb)),
    fire: () => [...listeners].forEach((cb) => cb()),
  }
})

afterEach(() => {
  engine?.dispose()
  if (ctrl) controllerBridge.detach(ctrl)
  ctrl = null
  vi.useRealTimers()
})

describe('engine.submit', () => {
  it('runs the plan, speaks every reply in order and logs them on the turn', async () => {
    makeEngine()
    const c = attach()
    const r = request([{ type: 'jump', count: 2 }, { type: 'time' }])
    const p = engine.submit(r)
    await vi.advanceTimersByTimeAsync(20_000)
    const outcome = await p
    expect(outcome.status).toBe('done')
    expect(outcome.replies.map((x) => x.key)).toEqual(['motion.jump', 'info.time'])
    expect(turnKeys(r.turnId)).toEqual(['motion.jump', 'info.time'])
    expect(speaker.spoken.map((s) => s.text)).toEqual(['vi:motion.jump', 'vi:info.time'])
    expect(c.calls.find((x) => x.method === 'play' && x.args[0] === 'Jump')?.args[1]).toMatchObject({
      repeat: 2,
    })
    expect(c.log).toContain('settle')
    expect(demo().card?.card.kind).toBe('time')
    expect(demo().live?.ref.key).toBe('info.time')
    expect(demo().run?.status).toBe('done')
  })

  it('a new submit interrupts the current run but keeps room state and timers', async () => {
    makeEngine()
    const c = attach()
    const first = engine.submit(
      request([
        { type: 'light', power: 'on' },
        { type: 'timer_start', seconds: 600 },
        { type: 'dance', seconds: 30 },
      ]),
    )
    await vi.advanceTimersByTimeAsync(8_000)
    expect(demo().room.light.on).toBe(true)
    expect(demo().timers).toHaveLength(1)
    expect(demo().robot.activity).toBe('dancing')

    const r2 = request([{ type: 'wave', count: 1 }])
    const second = engine.submit(r2)
    expect((await first).status).toBe('interrupted')
    expect(c.log).toContain('cancel')
    expect(speaker.cancel).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10_000)
    expect((await second).status).toBe('done')
    expect(demo().room.light.on).toBe(true)
    expect(demo().timers).toHaveLength(1)
    expect(demo().robot.activity).toBe('idle')
    expect(turnKeys(r2.turnId)).toEqual(['motion.wave'])
  })

  it('a timer alarm pre-empts the current plan (assertive, beep, title) and the next submit clears the title', async () => {
    const beep = vi.fn()
    makeEngine({ beep })
    const c = attach()
    const t = engine.submit(request([{ type: 'timer_start', seconds: 5 }]))
    await vi.advanceTimersByTimeAsync(2_000)
    expect((await t).status).toBe('done')

    const dance = engine.submit(request([{ type: 'dance', seconds: 60 }]))
    await vi.advanceTimersByTimeAsync(3_500)
    expect((await dance).status).toBe('interrupted')
    expect(bubbleKey()).toBe('timer.done')
    expect(demo().live).toMatchObject({ assertive: true, ref: { key: 'timer.done' } })
    expect(beep).toHaveBeenCalledTimes(1)
    expect(doc.title).toBe(`${ALARM_TITLE_PREFIX.vi}Ronaldo`)
    expect(demo().timers[0]?.ringing).toBe(true)
    await vi.advanceTimersByTimeAsync(8_000)
    expect(c.played('Wave')).toBeGreaterThan(0)
    expect(demo().timers).toHaveLength(0)

    const next = engine.submit(request([{ type: 'greet' }]))
    expect(doc.title).toBe('Ronaldo')
    await vi.advanceTimersByTimeAsync(5_000)
    expect((await next).status).toBe('done')
  })

  it('while the model loads: the lamp switches at once; the motion waits up to 10 s, then runs body-less', async () => {
    makeEngine()
    const r = request([
      { type: 'jump', count: 1 },
      { type: 'light', power: 'on' },
    ])
    const p = engine.submit(r)
    await vi.advanceTimersByTimeAsync(9_000)
    expect(turnKeys(r.turnId)).toEqual(['home.light_on', 'robot.not_ready'])
    expect(demo().room.light.on).toBe(true)
    await vi.advanceTimersByTimeAsync(10_000)
    const out = await p
    expect(out.status).toBe('done')
    expect(out.replies.map((x) => x.key)).toEqual(['home.light_on', 'robot.not_ready', 'motion.jump'])
  })

  it('a robot that appears quickly is used, without the "starting up" notice', async () => {
    makeEngine()
    const p = engine.submit(request([{ type: 'jump', count: 1 }]))
    await vi.advanceTimersByTimeAsync(500)
    const c = attach()
    await vi.advanceTimersByTimeAsync(5_000)
    const out = await p
    expect(out.replies.map((x) => x.key)).toEqual(['motion.jump'])
    expect(c.played('Jump')).toBe(1)
  })

  it('does not wait (nor say "starting up") when the 3D scene failed (no WebGL)', async () => {
    makeEngine()
    demo().setScene({ status: 'no-webgl' })
    const p = engine.submit(request([{ type: 'nod', count: 1 }]))
    await vi.advanceTimersByTimeAsync(1_500)
    const out = await p
    expect(out.replies.map((x) => x.key)).toEqual(['motion.nod'])
  })

  it('answers questions immediately without a robot', async () => {
    makeEngine()
    const p = engine.submit(request([{ type: 'time' }]))
    await vi.advanceTimersByTimeAsync(1_000)
    expect((await p).replies.map((x) => x.key)).toEqual(['info.time'])
  })

  it('muted: nothing is spoken; each blocking reply stays up readingMs(text)', async () => {
    usePrefs.setState({ muted: true })
    makeEngine()
    const r = request([{ type: 'time' }, { type: 'greet' }])
    const p = engine.submit(r)
    // 'vi:info.time' = 12 characters → 2500 + 12 × 55 = 3160 ms.
    await vi.advanceTimersByTimeAsync(3_100)
    expect(bubbleKey()).toBe('info.time')
    await vi.advanceTimersByTimeAsync(100)
    expect(bubbleKey()).toBe('chat.greet')
    await vi.advanceTimersByTimeAsync(4_000)
    expect((await p).status).toBe('done')
    expect(speaker.speak).not.toHaveBeenCalled()
    expect(turnKeys(r.turnId)).toEqual(['info.time', 'chat.greet'])
  })

  it('a missing voice (unavailable) still shows every reply and finishes', async () => {
    speaker = fakeSpeaker('unavailable', 0)
    makeEngine()
    const p = engine.submit(request([{ type: 'thanks' }, { type: 'praise' }]))
    await vi.advanceTimersByTimeAsync(8_000)
    expect((await p).replies.map((x) => x.key)).toEqual(['chat.thanks', 'chat.praise'])
  })

  it('set_language switches the UI language and replies in the new one', async () => {
    makeEngine()
    const p = engine.submit(request([{ type: 'set_language', lang: 'en' }]))
    await vi.advanceTimersByTimeAsync(2_000)
    await p
    expect(getPrefs().lang).toBe('en')
    expect(speaker.spoken).toEqual([{ text: 'en:pref.language', lang: 'en' }])
  })

  it('"tắt tiếng" mutes (and is not spoken)', async () => {
    makeEngine()
    const p = engine.submit(request([{ type: 'voice', on: false }]))
    await vi.advanceTimersByTimeAsync(4_000)
    expect((await p).replies.map((x) => x.key)).toEqual(['pref.voice'])
    expect(getPrefs().muted).toBe(true)
    expect(speaker.speak).not.toHaveBeenCalled()
  })

  it('unknown: confused + suggestions; partial_unknown after the understood parts', async () => {
    makeEngine()
    const suggestions = ['nhảy lên', 'bật đèn', 'mấy giờ rồi?', 'xin chào'].map((say) => ({
      say,
      label: { vi: say, en: say },
    }))
    const u = engine.submit(request([], { hasUnknown: true, suggestions }))
    await vi.advanceTimersByTimeAsync(3_000)
    const out = await u
    expect(out.replies).toEqual([
      { key: 'unknown', params: { suggestions: ['nhảy lên', 'bật đèn', 'mấy giờ rồi?'] }, seed: undefined },
    ])

    attach()
    const pu = engine.submit(request([{ type: 'nod', count: 1 }], { hasUnknown: true }))
    await vi.advanceTimersByTimeAsync(5_000)
    expect((await pu).replies.map((x) => x.key)).toEqual(['motion.nod', 'partial_unknown'])
  })

  it('timer commands reply from the timer service', async () => {
    makeEngine()
    const r = request([
      { type: 'timer_status' },
      { type: 'timer_start', seconds: 90 },
      { type: 'timer_status' },
    ])
    const p = engine.submit(r)
    await vi.advanceTimersByTimeAsync(3_000)
    const out = await p
    expect(out.replies.map((x) => x.key)).toEqual(['timer.none', 'timer.start', 'timer.status'])
    expect(out.replies[1]).toMatchObject({ params: { seconds: 90 } })
    const cancel = engine.submit(request([{ type: 'timer_cancel' }]))
    await vi.advanceTimersByTimeAsync(1_000)
    expect((await cancel).replies.map((x) => x.key)).toEqual(['timer.cancel'])
    expect(demo().timers).toHaveLength(0)
  })

  it('cancelTimer (the pill button) removes the timer and announces it', async () => {
    makeEngine()
    const p = engine.submit(request([{ type: 'timer_start', seconds: 60 }]))
    await vi.advanceTimersByTimeAsync(1_000)
    await p
    const id = demo().timers[0]!.id
    engine.cancelTimer(id)
    expect(demo().timers).toHaveLength(0)
    expect(demo().live?.ref.key).toBe('timer.cancel')
  })
})

describe('engine — weather', () => {
  const weather: Action = {
    type: 'weather',
    place: { id: 'hue', name: { vi: 'Huế', en: 'Hue' }, lat: 16.4637, lon: 107.5909 },
    dayOffset: 0,
    aspect: 'general',
  }

  it('loading card → ok card + info.weather', async () => {
    const fetchWeather = vi.fn(
      (_place: unknown, _opts: { signal: AbortSignal }) =>
        new Promise<WeatherData>((r) => setTimeout(() => r(WEATHER), 1_000)),
    )
    makeEngine({ fetchWeather })
    const p = engine.submit(request([weather]))
    await vi.advanceTimersByTimeAsync(10)
    expect(demo().card?.card).toMatchObject({ kind: 'weather', status: 'loading', place: { vi: 'Huế' } })
    await vi.advanceTimersByTimeAsync(3_000)
    const out = await p
    expect(demo().card?.card).toMatchObject({ kind: 'weather', status: 'ok', data: WEATHER })
    expect(out.replies[0]).toMatchObject({
      key: 'info.weather',
      params: { place: { vi: 'Huế' }, data: WEATHER },
    })
    expect(fetchWeather.mock.calls[0]?.[0]).toMatchObject({ id: 'hue' })
  })

  it('error card + info.weather_error with the typed reason', async () => {
    makeEngine({ fetchWeather: vi.fn(async () => Promise.reject(new WeatherError('timeout'))) })
    const p = engine.submit(request([weather]))
    await vi.advanceTimersByTimeAsync(3_000)
    const out = await p
    expect(demo().card?.card).toMatchObject({ kind: 'weather', status: 'error' })
    expect(out.replies[0]).toMatchObject({ key: 'info.weather_error', params: { reason: 'timeout' } })
  })

  it('an interrupt aborts the fetch and removes the loading card', async () => {
    let signal: AbortSignal | undefined
    const fetchWeather = vi.fn((_p: unknown, opts: { signal: AbortSignal }) => {
      signal = opts.signal
      return new Promise<WeatherData>((_r, reject) =>
        opts.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))),
      )
    })
    makeEngine({ fetchWeather })
    const p = engine.submit(request([weather]))
    await vi.advanceTimersByTimeAsync(100)
    engine.interrupt()
    expect((await p).status).toBe('interrupted')
    expect(signal?.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(10)
    expect(demo().card).toBeNull()
  })
})

describe('engine — welcome and return home', () => {
  it('shows the silent welcome the first time a robot attaches (visible page)', async () => {
    makeEngine({ welcomed: false, matches: (q) => q.includes('min-width') })
    const c = attach()
    await vi.advanceTimersByTimeAsync(3_000)
    expect(demo().bubble?.ref).toEqual({ key: 'welcome', params: { layout: 'side' }, seed: undefined })
    expect(speaker.speak).not.toHaveBeenCalled()
    expect(demo().live).toBeNull()
    expect(c.played('Wave')).toBe(1)
    expect(engine.welcomed).toBe(true)
  })

  it('waits for the page to be visible', async () => {
    doc.visibilityState = 'hidden'
    makeEngine({ welcomed: false })
    attach()
    await vi.advanceTimersByTimeAsync(100)
    expect(demo().bubble).toBeNull()
    doc.visibilityState = 'visible'
    for (const [, cb] of vi.mocked(doc.addEventListener).mock.calls) (cb as () => void)()
    await vi.advanceTimersByTimeAsync(10)
    expect(demo().bubble?.ref).toMatchObject({ key: 'welcome', params: { layout: 'stacked' } })
  })

  it('no welcome after the user already sent a command', async () => {
    makeEngine({ welcomed: false })
    const p = engine.submit(request([{ type: 'time' }]))
    await vi.advanceTimersByTimeAsync(1_000)
    await p
    attach()
    expect(bubbleKey()).toBe('info.time')
  })

  it('returnHome walks back to (0, 0) and faces the camera', async () => {
    makeEngine()
    const c = attach(new FakeController({ pose: { x: 1.2, z: 1, yaw: 1 } }))
    engine.returnHome()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(c.getPose()).toMatchObject({ x: 0, z: 0 })
    expect(c.getPose().yaw).toBeCloseTo(0)
    expect(demo().run?.status).toBe('done')
  })
})

describe('engine — alarms (regressions)', () => {
  const spokenAlarms = () => speaker.spoken.map((s) => s.text).filter((t) => t.includes('timer.done'))

  it('engine-alarm-1: two timers passing in ONE check are both announced, soonest first', async () => {
    makeEngine()
    attach()
    // Added in the "wrong" order: the later one first.
    const p = engine.submit(
      request([
        { type: 'timer_start', seconds: 120, label: 'tắt bếp' },
        { type: 'timer_start', seconds: 60, label: 'uống thuốc' },
      ]),
    )
    await vi.advanceTimersByTimeAsync(5_000)
    await p
    const rec = recordStore()
    // A throttled background tab: the clock jumps 3 minutes, then one check runs.
    vi.setSystemTime(Date.now() + 180_000)
    engine.timers.check()
    await vi.advanceTimersByTimeAsync(20_000)
    rec.unsub()
    expect(rec.bubbles).toEqual(['timer.done:uống thuốc', 'timer.done:tắt bếp'])
    expect(rec.lives).toEqual(['timer.done:uống thuốc', 'timer.done:tắt bếp'])
    expect(spokenAlarms()).toEqual(['vi:timer.done:uống thuốc', 'vi:timer.done:tắt bếp'])
    expect(demo().live?.assertive).toBe(true)
  })

  it('engine-alarm-1: an alarm that fires while another is on screen waits for it (nothing is cut off)', async () => {
    makeEngine()
    attach()
    const p = engine.submit(
      request([
        { type: 'timer_start', seconds: 60, label: 'uống thuốc' },
        { type: 'timer_start', seconds: 61, label: 'tắt bếp' },
      ]),
    )
    await vi.advanceTimersByTimeAsync(5_000)
    await p
    const rec = recordStore()
    await vi.advanceTimersByTimeAsync(70_000)
    rec.unsub()
    expect(rec.bubbles).toEqual(['timer.done:uống thuốc', 'timer.done:tắt bếp'])
    const alarmResults = speaker.results.filter((r) => r.text.includes('timer.done'))
    expect(alarmResults).toEqual([
      { text: 'vi:timer.done:uống thuốc', result: 'ended' },
      { text: 'vi:timer.done:tắt bếp', result: 'ended' },
    ])
  })

  it('engine-alarm-1: a timer stays "ringing" in the pill for the ring time after it is announced', async () => {
    makeEngine()
    attach()
    const p = engine.submit(
      request([
        { type: 'timer_start', seconds: 60, label: 'uống thuốc' },
        { type: 'timer_start', seconds: 61, label: 'tắt bếp' },
      ]),
    )
    await vi.advanceTimersByTimeAsync(5_000)
    await p
    let announcedAt = 0
    const unsub = useDemo.subscribe((s) => {
      if (
        !announcedAt &&
        s.bubble?.ref.key === 'timer.done' &&
        refText(s.bubble.ref, 'vi').includes('tắt bếp')
      )
        announcedAt = Date.now()
    })
    await vi.advanceTimersByTimeAsync(80_000)
    unsub()
    expect(announcedAt).toBeGreaterThan(0)
    // It was still ringing when it was announced, and it is gone afterwards.
    expect(demo().timers).toEqual([])
  })

  it('engine-muted-silent-alarm: muting the reading voice does not silence the alarm beep', async () => {
    usePrefs.setState({ muted: true })
    const beep = vi.fn()
    makeEngine({ beep })
    const p = engine.submit(request([{ type: 'timer_start', seconds: 1 }]))
    await vi.advanceTimersByTimeAsync(6_000)
    await p
    expect(bubbleKey()).toBe('timer.done')
    expect(beep).toHaveBeenCalledTimes(1)
    expect(speaker.speak).not.toHaveBeenCalled()
    expect(demo().live).toMatchObject({ assertive: true, ref: { key: 'timer.done' } })
  })

  it('engine-title-prefix-sticks: the prefix clears when the ring ends on a visible page', async () => {
    makeEngine()
    attach()
    const p = engine.submit(request([{ type: 'timer_start', seconds: 10 }]))
    await vi.advanceTimersByTimeAsync(3_000)
    await p
    await vi.advanceTimersByTimeAsync(8_000)
    expect(doc.title).toBe(`${ALARM_TITLE_PREFIX.vi}Ronaldo`)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(demo().timers).toEqual([])
    expect(doc.title).toBe('Ronaldo')
  })

  it('engine-title-prefix-sticks: in a hidden tab it stays until the page is visible again, and each alarm re-applies it', async () => {
    makeEngine()
    attach()
    const p = engine.submit(
      request([
        { type: 'timer_start', seconds: 60, label: 'uống thuốc' },
        { type: 'timer_start', seconds: 600, label: 'tắt bếp' },
      ]),
    )
    await vi.advanceTimersByTimeAsync(5_000)
    await p
    doc.visibilityState = 'hidden'
    doc.fire()
    await vi.advanceTimersByTimeAsync(70_000)
    expect(doc.title).toBe(`${ALARM_TITLE_PREFIX.vi}Ronaldo`)
    await vi.advanceTimersByTimeAsync(60_000) // the ring is long over; nobody looked yet
    expect(doc.title).toBe(`${ALARM_TITLE_PREFIX.vi}Ronaldo`)
    doc.visibilityState = 'visible'
    doc.fire()
    expect(doc.title).toBe('Ronaldo')
    // The second alarm shows the prefix again.
    doc.visibilityState = 'hidden'
    doc.fire()
    await vi.advanceTimersByTimeAsync(9 * 60_000)
    expect(doc.title).toBe(`${ALARM_TITLE_PREFIX.vi}Ronaldo`)
  })

  it('engine-pill-dismiss: dismissing a ringing timer stops the alarm and says the alarm is off', async () => {
    speaker = fakeSpeaker('ended', 3_000) // long enough to still be speaking the alarm
    const beep = vi.fn()
    makeEngine({ beep })
    const c = attach()
    const t = engine.submit(request([{ type: 'timer_start', seconds: 8, label: 'uống thuốc' }]))
    await vi.advanceTimersByTimeAsync(4_000)
    await t
    const rec = recordStore()
    void engine.submit(request([{ type: 'dance', seconds: 60 }]))
    await vi.advanceTimersByTimeAsync(4_600)
    expect(bubbleKey()).toBe('timer.done')
    const alarmRun = demo().run?.id
    const cancelsBefore = c.log.filter((x) => x === 'cancel').length
    engine.cancelTimer(demo().timers[0]!.id)
    expect(demo().timers).toEqual([])
    // The alarm run (speech, jumps) is stopped …
    expect(c.log.filter((x) => x === 'cancel').length).toBe(cancelsBefore + 1)
    expect(speaker.results.find((r) => r.text.includes('timer.done'))?.result).toBe('interrupted')
    expect(demo().run?.id).not.toBe(alarmRun)
    // … the title is cleared, and the robot confirms the alarm is off (not "timer cancelled").
    expect(doc.title).toBe('Ronaldo')
    await vi.advanceTimersByTimeAsync(4_000)
    rec.unsub()
    expect(bubbleKey()).toBe('timer.dismissed')
    expect(rec.lives).not.toContain('timer.cancel')
    expect(rec.lives.at(-1)).toBe('timer.dismissed:uống thuốc')
    expect(speaker.spoken.at(-1)?.text).toBe('vi:timer.dismissed:uống thuốc')
  })

  it('engine-pill-dismiss: cancelling a timer that is still counting down keeps the "timer cancelled" reply', async () => {
    makeEngine()
    const p = engine.submit(request([{ type: 'timer_start', seconds: 60 }]))
    await vi.advanceTimersByTimeAsync(1_000)
    await p
    engine.cancelTimer(demo().timers[0]!.id)
    expect(demo().timers).toHaveLength(0)
    expect(demo().live?.ref.key).toBe('timer.cancel')
  })

  it('engine-cancel-all-timers: "hủy nhắc uống thuốc" cancels only the timer with that label', async () => {
    makeEngine()
    const p = engine.submit(
      request([
        { type: 'timer_start', seconds: 900, label: 'uống thuốc' },
        { type: 'timer_start', seconds: 300, label: 'tắt bếp' },
      ]),
    )
    await vi.advanceTimersByTimeAsync(5_000)
    await p
    const c = engine.submit(request([{ type: 'timer_cancel', label: 'uống thuốc' }]))
    await vi.advanceTimersByTimeAsync(3_000)
    const out = await c
    expect(demo().timers.map((t) => t.label)).toEqual(['tắt bếp'])
    expect(out.replies.map((r) => refText(r, 'vi'))).toEqual(['vi:timer.cancel:uống thuốc'])
  })

  it('engine-cancel-all-timers: a label that matches no timer cancels nothing', async () => {
    makeEngine()
    const p = engine.submit(request([{ type: 'timer_start', seconds: 300, label: 'tắt bếp' }]))
    await vi.advanceTimersByTimeAsync(3_000)
    await p
    const c = engine.submit(request([{ type: 'timer_cancel', label: 'uống thuốc' }]))
    await vi.advanceTimersByTimeAsync(3_000)
    const out = await c
    expect(demo().timers.map((t) => t.label)).toEqual(['tắt bếp'])
    expect(out.replies.map((r) => refText(r, 'vi'))).toEqual(['vi:timer.none:uống thuốc'])
  })

  it('engine-cancel-all-timers: without a label every timer is cancelled (unchanged)', async () => {
    makeEngine()
    const p = engine.submit(
      request([
        { type: 'timer_start', seconds: 900, label: 'uống thuốc' },
        { type: 'timer_start', seconds: 300 },
      ]),
    )
    await vi.advanceTimersByTimeAsync(5_000)
    await p
    const c = engine.submit(request([{ type: 'timer_cancel' }]))
    await vi.advanceTimersByTimeAsync(3_000)
    expect((await c).replies.map((r) => r.key)).toEqual(['timer.cancel'])
    expect(demo().timers).toEqual([])
  })
})

describe('engine — sleeping pose', () => {
  it('a finished "ngủ đi" keeps the sleepy head and face (no settle), other runs settle', async () => {
    makeEngine()
    const c = attach()
    const p = engine.submit(request([{ type: 'sleep' }]))
    await vi.advanceTimersByTimeAsync(10_000)
    await p
    expect(demo().robot.posture).toBe('sleeping')
    expect(c.calls.filter((x) => x.method === 'settle')).toHaveLength(0)
    const p2 = engine.submit(request([{ type: 'wake' }]))
    await vi.advanceTimersByTimeAsync(10_000)
    await p2
    expect(demo().robot.posture).toBe('standing')
    expect(c.calls.filter((x) => x.method === 'settle')).toHaveLength(1)
  })
})

describe('engine — robot not ready / 2D fallback (regressions)', () => {
  const refusal: Action = {
    type: 'unsupported',
    reason: 'physical',
    verb: { vi: 'ăn', en: 'eat' },
    object: { vi: 'chuối', en: 'a banana' },
  }

  it('engine-not-ready-2d: no WebGL → motion runs at once against the 2D robot, never "starting up"', async () => {
    makeEngine()
    demo().setScene({ status: 'no-webgl', progress: null })
    const p = engine.submit(request([{ type: 'fall' }]))
    await vi.advanceTimersByTimeAsync(10)
    expect(bubbleKey()).toBe('motion.fall')
    await vi.advanceTimersByTimeAsync(8_000)
    const out = await p
    expect(out.replies.map((x) => x.key)).toEqual(['motion.fall', 'motion.fall_recover'])
  })

  it('ui-chunk-fail-stalls: a failed scene (status error) runs commands at once too', async () => {
    makeEngine()
    demo().setScene({ status: 'error', progress: null })
    const p = engine.submit(request([{ type: 'jump', count: 1 }]))
    await vi.advanceTimersByTimeAsync(10)
    expect(bubbleKey()).toBe('motion.jump')
    await vi.advanceTimersByTimeAsync(3_000)
    expect((await p).replies.map((x) => x.key)).toEqual(['motion.jump'])
  })

  it('engine-wait-holds-timer: while the model loads, timers, lamp and answers apply at once; only the motion waits', async () => {
    makeEngine()
    const first = engine.submit(
      request([
        { type: 'wave', count: 1 },
        { type: 'timer_start', seconds: 900, label: 'uống thuốc' },
        { type: 'light', power: 'on' },
      ]),
    )
    await vi.advanceTimersByTimeAsync(4_000)
    expect(demo().timers.map((t) => t.label)).toEqual(['uống thuốc'])
    expect(demo().room.light.on).toBe(true)
    // A second command 4 s later interrupts the wait: nothing that was already requested is lost.
    const second = engine.submit(request([{ type: 'time' }]))
    expect((await first).status).toBe('interrupted')
    await vi.advanceTimersByTimeAsync(3_000)
    expect((await second).status).toBe('done')
    expect(demo().timers.map((t) => t.label)).toEqual(['uống thuốc'])
    expect(demo().room.light.on).toBe(true)
  })

  it('engine-wait-holds-timer: the timer starts at submit, not after the 10 s wait', async () => {
    makeEngine()
    const p = engine.submit(
      request([
        { type: 'jump', count: 1 },
        { type: 'timer_start', seconds: 60, label: 'uống thuốc' },
      ]),
    )
    await vi.advanceTimersByTimeAsync(12_000)
    await p
    const left = Math.round((demo().timers[0]!.endsAt - Date.now()) / 1000)
    expect(left).toBe(48)
  })

  it('while the model loads: "starting up" after a moment, then the motion when the robot arrives', async () => {
    makeEngine()
    const r = request([{ type: 'jump', count: 1 }])
    const p = engine.submit(r)
    await vi.advanceTimersByTimeAsync(300)
    expect(bubbleKey()).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1_500)
    expect(bubbleKey()).toBe('robot.not_ready')
    const c = attach()
    await vi.advanceTimersByTimeAsync(5_000)
    const out = await p
    expect(out.replies.map((x) => x.key)).toEqual(['robot.not_ready', 'motion.jump'])
    expect(c.played('Jump')).toBe(1)
  })

  it('engine-posture-drift: a body that attaches while the store says sitting holds the Sitting pose', async () => {
    makeEngine()
    const p = engine.submit(request([{ type: 'sit' }]))
    await vi.advanceTimersByTimeAsync(12_000) // the model is not there: the 10 s wait times out
    await p
    expect(demo().robot.posture).toBe('sitting')
    const c = attach()
    demo().setScene({ status: 'ready', progress: 1 })
    expect(c.heldPose).toBe('Sitting')
    const again = engine.submit(request([{ type: 'sit' }]))
    await vi.advanceTimersByTimeAsync(3_000)
    expect((await again).replies.map((x) => x.key)).toEqual(['motion.already_sitting'])
    const jump = engine.submit(request([{ type: 'jump', count: 1 }]))
    await vi.advanceTimersByTimeAsync(5_000)
    await jump
    expect(c.log.filter((x) => x.startsWith('play'))).toEqual(['play:Standing', 'play:Jump'])
  })

  it('engine-posture-drift: a new body after a context loss adopts the sleeping posture', async () => {
    makeEngine()
    const c1 = attach()
    const p = engine.submit(request([{ type: 'sleep' }]))
    await vi.advanceTimersByTimeAsync(6_000)
    await p
    expect(demo().robot.posture).toBe('sleeping')
    controllerBridge.detach(c1)
    const c2 = attach()
    expect(c2.heldPose).toBe('Sitting')
    const wake = engine.submit(request([{ type: 'wave', count: 1 }]))
    await vi.advanceTimersByTimeAsync(6_000)
    await wake
    expect(c2.log.filter((x) => x.startsWith('play'))).toEqual(['play:Standing', 'play:Wave'])
  })

  it('engine-2d-sad-sticks: interrupting a refusal in 2D resets the face', async () => {
    makeEngine()
    demo().setScene({ status: 'no-webgl', progress: null })
    const a = engine.submit(request([refusal]))
    await vi.advanceTimersByTimeAsync(200)
    expect(demo().robot.expression).toBe('Sad')
    const b = engine.submit(request([{ type: 'time' }]))
    expect((await a).status).toBe('interrupted')
    expect(demo().robot.expression).toBeNull()
    await vi.advanceTimersByTimeAsync(5_000)
    expect((await b).status).toBe('done')
    expect(demo().robot.expression).toBeNull()
  })

  it('engine-2d-sad-sticks: 3D keeps the store face in step with the body after an interrupt', async () => {
    makeEngine()
    const c = attach()
    const a = engine.submit(request([{ type: 'emote', emotion: 'sad' }]))
    await vi.advanceTimersByTimeAsync(600)
    const b = engine.submit(request([{ type: 'time' }]))
    await vi.advanceTimersByTimeAsync(5_000)
    await a
    await b
    expect(demo().robot.expression).toBeNull()
    expect(c.face).toBeNull()
  })

  it('engine-2d-activity-invisible: without a body the activity stays up long enough to be seen', async () => {
    makeEngine()
    demo().setScene({ status: 'no-webgl', progress: null })
    const seen: string[] = []
    const unsub = useDemo.subscribe((s, prev) => {
      if (s.robot.activity !== prev.robot.activity) seen.push(`${s.robot.activity}@${Date.now()}`)
    })
    const t0 = Date.now()
    const p = engine.submit(
      request([
        { type: 'dance', seconds: 20 },
        { type: 'walk', direction: 'left', steps: 3 },
      ]),
    )
    await vi.advanceTimersByTimeAsync(1_000)
    expect(demo().robot.activity).toBe('dancing')
    await vi.advanceTimersByTimeAsync(30_000)
    await p
    unsub()
    const at = (name: string) =>
      seen.filter((x) => x.startsWith(`${name}@`)).map((x) => Number(x.split('@')[1]) - t0)
    expect(at('dancing')).toHaveLength(1)
    expect(at('walking')).toHaveLength(1)
    // Each activity is visible for a while (not flipped back in the same tick) …
    expect(at('walking')[0]! - at('dancing')[0]!).toBeGreaterThanOrEqual(2_000)
    // … but a 20 s dance does not keep the 2D robot busy for 20 s.
    expect(at('walking')[0]!).toBeLessThan(6_000)
    expect(demo().robot.activity).toBe('idle')
  })

  it('engine-silent-bubble-2500: an unspoken reply stays up long enough to read (2.5 s + 55 ms/char, ≤ 8 s)', async () => {
    usePrefs.setState({ muted: true })
    makeEngine()
    const r = request([{ type: 'capabilities' }, { type: 'time' }])
    const p = engine.submit(r)
    // 'vi:chat.capabilities' is 20 characters → 2500 + 20 × 55 = 3600 ms.
    await vi.advanceTimersByTimeAsync(3_500)
    expect(bubbleKey()).toBe('chat.capabilities')
    await vi.advanceTimersByTimeAsync(200)
    expect(bubbleKey()).toBe('info.time')
    await vi.advanceTimersByTimeAsync(5_000)
    expect((await p).status).toBe('done')
    expect(speaker.speak).not.toHaveBeenCalled()
  })
})

describe('engine.think (Qwen is inventing a move)', () => {
  const MOVE = THINKING // any valid script will do

  it('interrupts the current run, holds the thinking pose, and the next submit replaces it', async () => {
    makeEngine()
    const c = attach()
    const first = engine.submit(request([{ type: 'dance', seconds: 30 }]))
    await vi.advanceTimersByTimeAsync(2_000)
    const r = request([])
    engine.think(r.turnId)
    expect((await first).status).toBe('interrupted')
    await vi.advanceTimersByTimeAsync(5_000)
    expect(c.calls.filter((x) => x.method === 'perform')).toHaveLength(1)
    expect(c.calls.find((x) => x.method === 'perform')?.args[1]).toMatchObject({ loop: true })
    expect(turnKeys(r.turnId)).toEqual(['ai.thinking'])
    expect(demo().run?.status).toBe('running')

    const second = engine.submit({ ...r, actions: [{ type: 'custom_move', move: MOVE, count: 1 }] })
    await vi.advanceTimersByTimeAsync(30_000)
    expect((await second).status).toBe('done')
    expect(turnKeys(r.turnId)).toEqual(['ai.thinking', 'motion.custom_move'])
    const performs = c.calls.filter((x) => x.method === 'perform')
    expect(performs).toHaveLength(2)
    expect(performs[1]!.args[1]).toMatchObject({ count: 1 })
    expect(demo().robot.activity).toBe('idle')
  })
})
