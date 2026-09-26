import { LIMITS } from '@/core/actions'
import type { InfoCard } from '@/core/engine'
import type { Lang } from '@/core/lang'
import type { PlaceRef } from '@/core/places'
import { reply, type RenderedReply, type ReplyRef } from '@/core/replies'
import type { Speaker } from '@/core/speech'
import type { WeatherData } from '@/core/weather'
import { isWeatherError } from '@/services/weather'
import type { demo, TimerState } from '@/store/demoStore'
import { distance } from './bounds'
import { CARD_TTL, CLIP_DURATION, NO_BODY_HOLD_MAX_MS, readingMs } from './spec'
import type { TimerService } from './timers'
import { BODY_OPS, type AnimationController, type Step } from './types'

/**
 * The executor: runs a plan's steps against the store, the speaker, the timers and (when one is
 * attached) the 3D robot's AnimationController.
 *
 * - One AbortController per run: an interrupt resolves every await at once (the controller's own
 *   promises resolve on `cancel()`; sleeps, speech and fetches listen to the signal). Room changes
 *   and timers already applied are kept.
 * - Without a controller (no WebGL, or the model is still loading) body ops are skipped, except that
 *   holds and moves pause briefly (≤ NO_BODY_HOLD_MAX_MS) so the 2D robot shows what it is doing.
 * - Replies go through one serial chain, so bubbles and speech never overlap and stay in order:
 *   a non-blocking reply starts when the previous one has finished (the body keeps moving);
 *   a blocking one also holds the plan until it has been spoken. Without speech (muted, or no
 *   voice for the language) a reply stays up for readingMs(text) before the next one.
 * - A run may have several phases (`steps()` more than once, e.g. answers first, then the motion
 *   once the 3D robot has loaded); they share the reply chain. `finish()` waits for the last reply.
 * - A wall-clock watchdog guards every controller promise, on top of the controller's own
 *   (controller-time) watchdogs, so nothing can stall a run for good.
 */

type Store = ReturnType<typeof demo>

export type ExecStore = Pick<
  Store,
  | 'setBubble'
  | 'patchBubble'
  | 'appendTurnReply'
  | 'announce'
  | 'showCard'
  | 'clearCard'
  | 'patchRoom'
  | 'patchRobot'
  | 'patchRun'
>

export interface ExecPrefs {
  lang: Lang
  muted: boolean
  setLang(lang: Lang): void
  setMuted(muted: boolean): void
}

export interface ExecutorDeps {
  store(): ExecStore
  controller(): AnimationController | null
  speaker: Pick<Speaker, 'speak' | 'cancel'>
  render(ref: ReplyRef, lang: Lang): RenderedReply
  prefs(): ExecPrefs
  timers: Pick<TimerService, 'start' | 'cancelAll' | 'cancelByLabel' | 'status'>
  fetchWeather(place: PlaceRef, opts: { signal: AbortSignal }): Promise<WeatherData>
  /** The alarm sound. It may return a function that stops it (called when the run is interrupted). */
  beep(): void | (() => void)
}

export interface RunHandle {
  id: number
  /** The turn the replies belong to (null for the welcome, alarms and "Về chỗ cũ"). */
  turnId: string | null
  signal: AbortSignal
  /** Replies shown (silent ones excluded), in order. */
  replies: ReplyRef[]
}

export type ExecStatus = 'done' | 'interrupted'

/** Extra wall-clock slack before the executor gives up on a controller promise. */
export const WATCHDOG_SLACK_MS = 5_000
export const WATCHDOG_FACTOR = 1.5

/** A setTimeout that resolves early (never rejects) when the signal aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted || ms <= 0) return resolve()
    const done = () => {
      clearTimeout(t)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    const t = setTimeout(done, ms)
    signal?.addEventListener('abort', done, { once: true })
  })
}

type SayStep = Extract<Step, { op: 'say' }>
type BodyStep = Extract<Step, { op: 'base' | 'clip' | 'hold' | 'move' | 'turn' | 'expr' | 'head' | 'script' }>

const isBody = (s: Step): s is BodyStep => BODY_OPS.has(s.op)

export class Execution {
  private readonly run: RunHandle
  private readonly deps: ExecutorDeps
  /** Gate for the next reply (includes the reading pause of an unspoken reply). */
  private chain: Promise<void> = Promise.resolve()
  /** The last reply's job (the run ends when it has been spoken). */
  private lastJob: Promise<unknown> = Promise.resolve()
  /** Steps executed by earlier phases (for the run's progress index). */
  private offset = 0

  constructor(run: RunHandle, deps: ExecutorDeps) {
    this.run = run
    this.deps = deps
  }

  get aborted(): boolean {
    return this.run.signal.aborted
  }

  /** Runs one phase of steps (replies may still be on their way when it returns). */
  async steps(steps: Step[]): Promise<void> {
    const base = this.offset
    this.offset += steps.length
    for (let i = 0; i < steps.length; i++) {
      if (this.aborted) return
      this.deps.store().patchRun(this.run.id, { index: base + i, total: this.offset })
      await this.step(steps[i]!)
    }
  }

  /** Waits for the last reply to be spoken. */
  async finish(): Promise<ExecStatus> {
    if (!this.aborted) await this.lastJob
    return this.aborted ? 'interrupted' : 'done'
  }

  async execute(steps: Step[]): Promise<ExecStatus> {
    await this.steps(steps)
    return this.finish()
  }

  private async step(s: Step): Promise<void> {
    if (this.aborted) return
    if (isBody(s)) return this.body(s)
    const store = this.deps.store()
    switch (s.op) {
      case 'say':
        return this.say(s)
      case 'card':
        store.showCard(s.card, s.ttlMs)
        return
      case 'room':
        store.patchRoom(s.patch)
        return
      case 'robot':
        store.patchRobot(s.patch)
        return
      case 'pref': {
        const prefs = this.deps.prefs()
        if (s.lang !== undefined && s.lang !== prefs.lang) prefs.setLang(s.lang)
        if (s.muted !== undefined && s.muted !== prefs.muted) {
          prefs.setMuted(s.muted)
          if (s.muted) this.deps.speaker.cancel()
        }
        return
      }
      case 'timer_start': {
        const r = this.deps.timers.start(s.seconds, s.label)
        const ref = r.ok
          ? reply('timer.start', {
              seconds: Math.round(r.timer.durationMs / 1000),
              ...(s.label ? { label: s.label } : {}),
            })
          : reply('timer.limit', { max: LIMITS.maxTimers })
        return this.say({ op: 'say', reply: ref, wait: true })
      }
      case 'timer_cancel':
        return this.say({ op: 'say', reply: this.cancelTimers(s.label), wait: true })
      case 'timer_status': {
        const st = this.deps.timers.status()
        const ref = st ? reply('timer.status', st) : reply('timer.none', {})
        return this.say({ op: 'say', reply: ref, wait: true })
      }
      case 'weather':
        return this.weather(s)
      case 'beep': {
        // The alarm sound is not the reading voice: it plays even when the voice is muted
        // (a medicine reminder must be heard). An interrupt (e.g. dismissing the alarm) stops it.
        const stop = this.deps.beep()
        if (typeof stop === 'function') this.run.signal.addEventListener('abort', stop, { once: true })
        return
      }
      case 'parallel':
        await Promise.all(s.steps.map((c) => this.step(c)))
        return
      case 'seq':
        for (const c of s.steps) {
          if (this.aborted) return
          await this.step(c)
        }
        return
    }
  }

  /** "hủy hẹn giờ" (every timer) or "hủy nhắc uống thuốc" (only that one). */
  private cancelTimers(label: string | undefined): ReplyRef {
    const cancelled: TimerState[] = label
      ? this.deps.timers.cancelByLabel(label)
      : this.deps.timers.cancelAll()
    const l = label ? { label } : {}
    if (cancelled.length === 0) return reply('timer.none', l)
    // Only ringing timers were stopped: that is silencing an alarm, not cancelling a countdown.
    if (cancelled.every((t) => t.ringing)) return reply('timer.dismissed', l)
    return reply('timer.cancel', l)
  }

  // ---- body

  private body(s: BodyStep): Promise<void> {
    if (s.op === 'expr') this.deps.store().patchRobot({ expression: s.name })
    const ctrl = this.deps.controller()
    if (!ctrl) return this.bodyless(s)
    switch (s.op) {
      case 'base':
        ctrl.setBase(s.clip, { fade: s.fade, timeScale: s.timeScale })
        return Promise.resolve()
      case 'clip': {
        const repeat = s.repeat ?? 1
        const ts = Math.abs(s.timeScale ?? 1) || 1
        const est = (CLIP_DURATION[s.clip] * 1000 * repeat) / ts + (s.fade ?? 0.2) * 1000
        return this.guard(ctrl, ctrl.play(s.clip, { repeat, timeScale: s.timeScale, fade: s.fade }), est)
      }
      case 'hold':
        return this.guard(ctrl, ctrl.wait(s.ms), s.ms)
      case 'move': {
        const est = (distance(ctrl.getPose(), s.to) / Math.max(0.05, s.speed)) * 1000
        return this.guard(ctrl, ctrl.moveTo(s.to, { speed: s.speed }), est)
      }
      case 'turn':
        return this.guard(ctrl, ctrl.turnTo(s.yaw, { extraTurns: s.extraTurns, durationMs: s.ms }), s.ms)
      case 'expr':
        return this.guard(ctrl, ctrl.expression(s.name, s.weight, s.ms), s.ms ?? 300)
      case 'head':
        return this.guard(ctrl, ctrl.head({ pitch: s.pitch, roll: s.roll, yaw: s.yaw }, s.ms), s.ms ?? 300)
      case 'script':
        return this.guard(
          ctrl,
          ctrl.perform(s.move, { count: s.count, to: s.to, timeScale: s.timeScale, loop: s.loop }),
          s.ms,
        )
    }
  }

  /**
   * No body: gestures, turns and faces are skipped, but holds and moves pause (briefly), so the
   * semantic state they bracket — dancing, walking, lying after a fall — is on screen for a moment
   * instead of flipping back in the same tick.
   */
  private bodyless(s: BodyStep): Promise<void> {
    const ms = s.op === 'hold' || s.op === 'script' ? s.ms : s.op === 'move' ? (s.ms ?? 0) : 0
    return ms > 0 ? sleep(Math.min(ms, NO_BODY_HOLD_MAX_MS), this.run.signal) : Promise.resolve()
  }

  /** Resolves with the controller promise, on abort, or when the wall-clock watchdog expires. */
  private guard(ctrl: AnimationController, p: Promise<void>, estimateMs: number): Promise<void> {
    const signal = this.run.signal
    return new Promise<void>((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        clearTimeout(watchdog)
        signal.removeEventListener('abort', finish)
        resolve()
      }
      const watchdog = setTimeout(
        () => {
          if (settled) return
          console.warn('[engine] animation watchdog expired; cancelling the controller')
          ctrl.cancel({ fade: 0.2 })
          finish()
        },
        Math.max(0, estimateMs) * WATCHDOG_FACTOR + WATCHDOG_SLACK_MS,
      )
      signal.addEventListener('abort', finish, { once: true })
      p.then(finish, (err: unknown) => {
        console.error('[engine] animation step failed', err)
        finish()
      })
    })
  }

  // ---- replies

  private say(s: SayStep): Promise<void> {
    const gate = this.chain
    const job = (async (): Promise<{ spoken: boolean; text: string }> => {
      await gate
      if (this.aborted) return { spoken: true, text: '' }
      try {
        return await this.show(s)
      } catch (err) {
        console.error('[engine] reply failed', err)
        return { spoken: true, text: '' }
      }
    })()
    // An unspoken reply stays up long enough to read before the next one replaces it.
    const next = job.then(({ spoken, text }) =>
      spoken || this.aborted ? undefined : sleep(readingMs(text), this.run.signal),
    )
    this.chain = next
    this.lastJob = job
    return s.wait ? next : Promise.resolve()
  }

  /** Bubble + turn log + live region + speech. Returns whether it was read aloud. */
  private async show(s: SayStep): Promise<{ spoken: boolean; text: string }> {
    const store = this.deps.store()
    const prefs = this.deps.prefs()
    const lang = prefs.lang
    const rendered = this.deps.render(s.reply, lang)
    const bubbleId = store.setBubble(s.reply, rendered.tone)
    // The welcome: bubble only (no TTS before a user gesture, not part of any turn).
    if (s.silent) return { spoken: true, text: rendered.text }

    if (this.run.turnId) store.appendTurnReply(this.run.turnId, s.reply)
    this.run.replies.push(s.reply)
    store.announce(s.reply, s.assertive === true)
    if (prefs.muted || !rendered.speech.trim()) return { spoken: false, text: rendered.text }

    let result
    try {
      result = await this.deps.speaker.speak(rendered.speech, lang, {
        signal: this.run.signal,
        onStart: () => this.deps.store().patchBubble(bubbleId, { speaking: true }),
      })
    } finally {
      this.deps.store().patchBubble(bubbleId, { speaking: false })
    }
    return { spoken: result === 'ended' || result === 'interrupted', text: rendered.text }
  }

  // ---- weather

  private async weather(s: Extract<Step, { op: 'weather' }>): Promise<void> {
    const { place, dayOffset, aspect } = s
    const base = { kind: 'weather' as const, place: place.name, dayOffset }
    const card = (c: Extract<InfoCard, { kind: 'weather' }>, ttl: number | null) =>
      this.deps.store().showCard(c, ttl)
    const loadingId = card({ ...base, status: 'loading' }, null)
    const ctrl = this.deps.controller()
    // "Thinking": a slight head tilt while the forecast loads.
    if (ctrl) void this.guard(ctrl, ctrl.head({ pitch: 0.2 }, 300), 300)

    let data: WeatherData | null = null
    let reason: 'offline' | 'timeout' | 'http' = 'http'
    try {
      data = await this.deps.fetchWeather(place, { signal: this.run.signal })
    } catch (err) {
      if (isWeatherError(err)) reason = err.kind
      else if (!this.aborted) console.error('[engine] weather failed', err)
    }
    if (this.aborted) {
      this.deps.store().clearCard(loadingId)
      return
    }
    const now = this.deps.controller()
    if (now) void this.guard(now, now.head({ pitch: 0 }, 300), 300)

    if (data) {
      card({ ...base, status: 'ok', data }, CARD_TTL.weather)
      await this.say({
        op: 'say',
        reply: reply('info.weather', { place: place.name, dayOffset, aspect, data }),
        wait: true,
      })
      return
    }
    card({ ...base, status: 'error' }, CARD_TTL.weather)
    await Promise.all([
      this.step({ op: 'expr', name: 'Sad', weight: 0.5, ms: 400 }),
      this.say({ op: 'say', reply: reply('info.weather_error', { place: place.name, reason }), wait: true }),
    ])
    await this.step({ op: 'expr', name: null, ms: 400 })
  }
}

/** Runs `steps` to the end (→ 'done') or until `run.signal` aborts (→ 'interrupted'). */
export function execute(steps: Step[], run: RunHandle, deps: ExecutorDeps): Promise<ExecStatus> {
  return new Execution(run, deps).execute(steps)
}
