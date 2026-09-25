import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Lang } from '@/core/lang'
import { reply, type ReplyRef } from '@/core/replies'
import type { SpeakResult } from '@/core/speech'
import { execute, WATCHDOG_SLACK_MS, type ExecPrefs, type ExecStore, type ExecutorDeps } from './executor'
import { FakeController } from './fakeController'
import { NO_BODY_HOLD_MAX_MS } from './spec'
import type { OnceClip, PlayOptions, Step } from './types'

/** A controller whose clips never finish (a lost `finished` event). */
class StuckController extends FakeController {
  override play(clip: OnceClip, opts?: PlayOptions): Promise<void> {
    void super.play(clip, opts)
    return new Promise(() => {})
  }
}

function makeStore() {
  const events: string[] = []
  let id = 0
  const store: ExecStore = {
    setBubble: (ref: ReplyRef) => {
      events.push(`bubble:${ref.key}`)
      return ++id
    },
    patchBubble: () => {},
    appendTurnReply: (turnId: string, ref: ReplyRef) => void events.push(`turn:${turnId}:${ref.key}`),
    announce: (ref: ReplyRef, assertive?: boolean) =>
      void events.push(`live:${ref.key}${assertive ? '!' : ''}`),
    showCard: (card) => {
      events.push(`card:${card.kind}`)
      return ++id
    },
    clearCard: () => void events.push('clearCard'),
    patchRoom: () => void events.push('room'),
    patchRobot: (p) => void events.push(`robot:${JSON.stringify(p)}`),
    patchRun: () => {},
  }
  return { store, events }
}

function makeDeps(over: Partial<ExecutorDeps> = {}) {
  const { store, events } = makeStore()
  const prefs: ExecPrefs = {
    lang: 'vi',
    muted: false,
    setLang(l: Lang) {
      prefs.lang = l
    },
    setMuted(m: boolean) {
      prefs.muted = m
    },
  }
  const speak = vi.fn(
    (_t: string, _l: Lang, o?: { signal?: AbortSignal }) =>
      new Promise<SpeakResult>((r) => {
        const t = setTimeout(() => r('ended'), 1_000)
        o?.signal?.addEventListener('abort', () => {
          clearTimeout(t)
          r('interrupted')
        })
      }),
  )
  const deps: ExecutorDeps = {
    store: () => store,
    controller: () => null,
    speaker: { speak, cancel: vi.fn() },
    render: (ref, lang) => ({ text: `${lang}:${ref.key}`, speech: `${lang}:${ref.key}`, tone: 'normal' }),
    prefs: () => prefs,
    timers: {
      start: vi.fn(),
      cancelAll: vi.fn(() => []),
      cancelByLabel: vi.fn(() => []),
      status: vi.fn(() => null),
    },
    fetchWeather: vi.fn(),
    beep: vi.fn(),
    ...over,
  }
  return { deps, events, speak, prefs }
}

const run = (signal = new AbortController().signal, turnId: string | null = 't1') => ({
  id: 1,
  turnId,
  signal,
  replies: [] as ReplyRef[],
})

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('executor', () => {
  it('skips body ops without a controller but still applies semantic steps', async () => {
    const { deps, events } = makeDeps()
    const steps: Step[] = [
      { op: 'clip', clip: 'Jump', repeat: 3 },
      { op: 'hold', ms: 10_000 },
      { op: 'room', patch: { light: { on: true } } },
    ]
    const p = execute(steps, run(), deps)
    // The hold still pauses (capped), so a 2D robot shows the activity for a moment.
    await vi.advanceTimersByTimeAsync(NO_BODY_HOLD_MAX_MS - 100)
    expect(events).toEqual([])
    await vi.advanceTimersByTimeAsync(200)
    expect(await p).toBe('done')
    expect(events).toEqual(['room'])
  })

  it('serializes replies: a later reply waits for the earlier speech; order is kept', async () => {
    const { deps, events, speak } = makeDeps()
    const r = run()
    const steps: Step[] = [
      { op: 'say', reply: reply('motion.jump', { count: 1 }), wait: false },
      { op: 'say', reply: reply('info.time', { iso: 'x' }), wait: true },
    ]
    const p = execute(steps, r, deps)
    await vi.advanceTimersByTimeAsync(500)
    expect(events.filter((e) => e.startsWith('bubble'))).toEqual(['bubble:motion.jump'])
    await vi.advanceTimersByTimeAsync(2_000)
    expect(await p).toBe('done')
    expect(speak).toHaveBeenCalledTimes(2)
    expect(events).toEqual([
      'bubble:motion.jump',
      'turn:t1:motion.jump',
      'live:motion.jump',
      'bubble:info.time',
      'turn:t1:info.time',
      'live:info.time',
    ])
    expect(r.replies.map((x) => x.key)).toEqual(['motion.jump', 'info.time'])
  })

  it('silent replies only set the bubble; assertive replies announce assertively', async () => {
    const { deps, events, speak } = makeDeps()
    const p = execute(
      [
        { op: 'say', reply: reply('welcome', { layout: 'side' }), wait: false, silent: true },
        { op: 'say', reply: reply('timer.done', {}), wait: false, assertive: true },
      ],
      run(new AbortController().signal, null),
      deps,
    )
    await vi.advanceTimersByTimeAsync(2_000)
    await p
    expect(events).toEqual(['bubble:welcome', 'bubble:timer.done', 'live:timer.done!'])
    expect(speak).toHaveBeenCalledTimes(1)
  })

  it('the wall-clock watchdog frees a stuck animation and cancels the controller', async () => {
    const ctrl = new StuckController()
    const { deps } = makeDeps({ controller: () => ctrl })
    const p = execute(
      [
        { op: 'clip', clip: 'Wave' },
        { op: 'room', patch: { fan: { on: true } } },
      ],
      run(),
      deps,
    )
    await vi.advanceTimersByTimeAsync(1_833 * 1.5 + 300 * 1.5 + WATCHDOG_SLACK_MS + 100)
    expect(await p).toBe('done')
    expect(ctrl.log).toContain('cancel')
  })

  it('an abort resolves the run at once as interrupted', async () => {
    const ctrl = new FakeController()
    const { deps, events } = makeDeps({ controller: () => ctrl })
    const ac = new AbortController()
    const p = execute(
      [
        { op: 'hold', ms: 60_000 },
        { op: 'room', patch: { light: { on: true } } },
      ],
      run(ac.signal),
      deps,
    )
    await vi.advanceTimersByTimeAsync(100)
    ac.abort()
    expect(await p).toBe('interrupted')
    expect(events).not.toContain('room')
  })

  it('engine-muted-silent-alarm: the beep plays even when muted, and an interrupt stops it', async () => {
    const stop = vi.fn()
    const beep = vi.fn(() => stop)
    const { deps, prefs } = makeDeps({ beep })
    prefs.muted = true
    const ac = new AbortController()
    const p = execute([{ op: 'beep' }, { op: 'hold', ms: 60_000 }], run(ac.signal), deps)
    await vi.advanceTimersByTimeAsync(10)
    expect(beep).toHaveBeenCalledTimes(1)
    expect(stop).not.toHaveBeenCalled()
    ac.abort()
    expect(await p).toBe('interrupted')
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('engine-cancel-all-timers: timer_cancel with a label cancels by label; ringing-only → timer.dismissed', async () => {
    const ringing = { id: 'a', durationMs: 1, endsAt: 0, label: 'uống thuốc', ringing: true }
    const counting = { id: 'b', durationMs: 1, endsAt: 0, label: 'tắt bếp' }
    const cancelByLabel = vi.fn((label: string) => (label === 'uống thuốc' ? [ringing] : []))
    const cancelAll = vi.fn(() => [ringing, counting])
    const { deps, events } = makeDeps({
      timers: { start: vi.fn(), cancelAll, cancelByLabel, status: vi.fn(() => null) },
    })
    const r = run()
    const p = execute(
      [
        { op: 'timer_cancel', label: 'uống thuốc' },
        { op: 'timer_cancel', label: 'đi ngủ' },
        { op: 'timer_cancel' },
      ],
      r,
      deps,
    )
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await p).toBe('done')
    expect(cancelByLabel.mock.calls.map((c) => c[0])).toEqual(['uống thuốc', 'đi ngủ'])
    expect(r.replies).toEqual([
      { key: 'timer.dismissed', params: { label: 'uống thuốc' }, seed: undefined },
      { key: 'timer.none', params: { label: 'đi ngủ' }, seed: undefined },
      { key: 'timer.cancel', params: {}, seed: undefined },
    ])
    expect(events.filter((e) => e.startsWith('bubble'))).toHaveLength(3)
  })

  it('pref steps switch the language before the reply is rendered', async () => {
    const { deps, speak, prefs } = makeDeps()
    const p = execute(
      [
        { op: 'pref', lang: 'en' },
        { op: 'say', reply: reply('pref.language', { lang: 'en' }), wait: true },
      ],
      run(),
      deps,
    )
    await vi.advanceTimersByTimeAsync(2_000)
    await p
    expect(prefs.lang).toBe('en')
    expect(speak.mock.calls[0]?.slice(0, 2)).toEqual(['en:pref.language', 'en'])
  })
})
