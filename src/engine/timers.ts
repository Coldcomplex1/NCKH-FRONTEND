import { LIMITS } from '@/core/actions'
import type { TimerState } from '@/store/demoStore'
import { TIMER_RING_MS } from './spec'

/**
 * Wall-clock countdown timers ("hẹn giờ 1 phút"). They live outside React/R3F so they keep running
 * while the canvas is paused or offscreen: deadlines are absolute (`endsAt`, epoch ms), re-checked
 * every 250 ms and on `visibilitychange` (background tabs throttle intervals, sometimes by a minute).
 * State is mirrored into the demo store so the TimerPill can render it.
 *
 * A timer whose deadline passes "rings" (the pill turns red) for `ringMs`, then it is removed. A
 * throttled background tab can pass several deadlines between two checks: they are all handed to
 * `onFire` together, soonest first, so every one of them gets announced.
 */

export interface TimerStore {
  getTimers(): TimerState[]
  addTimer(t: TimerState): void
  patchTimer(id: string, patch: Partial<TimerState>): void
  removeTimer(id: string): void
}

export interface TimerServiceOptions {
  store: TimerStore
  /** Called once per check with every timer whose deadline has just passed, soonest first. */
  onFire(timers: TimerState[]): void
  /** Called when a ringing timer is removed because its ring is over (not when it is cancelled). */
  onRingEnd?(t: TimerState): void
  now?: () => number
  ringMs?: number
  /** Document for visibilitychange (null in node tests). */
  doc?: {
    addEventListener(type: 'visibilitychange', cb: () => void): void
    removeEventListener(type: 'visibilitychange', cb: () => void): void
  } | null
}

export type StartResult = { ok: true; timer: TimerState } | { ok: false; reason: 'limit' }

const CHECK_MS = 250

let idSeq = 0

/** Labels compare case-, space- and diacritics-insensitively ("Uống thuốc" = "uong thuoc"). */
export function labelKey(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export class TimerService {
  private readonly opts: TimerServiceOptions
  private readonly now: () => number
  private interval: ReturnType<typeof setInterval> | null = null
  private readonly removals = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly onVisibility = () => this.check()

  constructor(opts: TimerServiceOptions) {
    this.opts = opts
    this.now = opts.now ?? Date.now
    opts.doc?.addEventListener('visibilitychange', this.onVisibility)
    // Adopt timers left in the store by a previous instance (dev HMR).
    for (const t of opts.store.getTimers()) {
      if (t.ringing) this.scheduleRemoval(t.id)
    }
    this.syncInterval()
    this.check()
  }

  /** Timers still counting down (ringing ones are on their way out). */
  get active(): TimerState[] {
    return this.opts.store.getTimers().filter((t) => !t.ringing)
  }

  start(seconds: number, label?: string): StartResult {
    if (this.active.length >= LIMITS.maxTimers) return { ok: false, reason: 'limit' }
    const s = Math.min(LIMITS.maxTimerSeconds, Math.max(1, Math.round(seconds)))
    const durationMs = s * 1000
    const timer: TimerState = {
      id: `timer-${this.now().toString(36)}-${++idSeq}`,
      durationMs,
      endsAt: this.now() + durationMs,
      ...(label ? { label } : {}),
    }
    this.opts.store.addTimer(timer)
    this.syncInterval()
    return { ok: true, timer }
  }

  cancel(id: string): boolean {
    const exists = this.opts.store.getTimers().some((t) => t.id === id)
    this.clearRemoval(id)
    if (exists) this.opts.store.removeTimer(id)
    this.syncInterval()
    return exists
  }

  /** Cancels every timer (the command "hủy hẹn giờ" names none). Returns the cancelled timers. */
  cancelAll(): TimerState[] {
    const all = [...this.opts.store.getTimers()]
    for (const t of all) this.cancel(t.id)
    return all
  }

  /** Cancels only the timers with this label ("hủy nhắc uống thuốc"). Returns the cancelled timers. */
  cancelByLabel(label: string): TimerState[] {
    const key = labelKey(label)
    const hits = this.opts.store.getTimers().filter((t) => t.label !== undefined && labelKey(t.label) === key)
    for (const t of hits) this.cancel(t.id)
    return hits
  }

  /**
   * (Re)start a ringing timer's ring from now: an alarm that had to wait for another one to finish
   * keeps ringing in the pill until `ringMs` after it was actually announced.
   */
  ring(id: string): void {
    if (this.opts.store.getTimers().some((t) => t.id === id && t.ringing)) this.scheduleRemoval(id)
  }

  /** The timer that ends soonest. */
  status(): { remainingSec: number; label?: string } | null {
    const next = [...this.active].sort((a, b) => a.endsAt - b.endsAt)[0]
    if (!next) return null
    const remainingSec = Math.max(0, Math.ceil((next.endsAt - this.now()) / 1000))
    return next.label ? { remainingSec, label: next.label } : { remainingSec }
  }

  /** Fire every timer whose deadline has passed (all of them in one onFire call, soonest first). */
  check(): void {
    const t = this.now()
    const due = this.active.filter((timer) => timer.endsAt <= t).sort((a, b) => a.endsAt - b.endsAt)
    for (const timer of due) {
      this.opts.store.patchTimer(timer.id, { ringing: true })
      this.scheduleRemoval(timer.id)
    }
    this.syncInterval()
    if (due.length > 0) this.opts.onFire(due.map((timer) => ({ ...timer, ringing: true })))
  }

  dispose(): void {
    if (this.interval) clearInterval(this.interval)
    this.interval = null
    for (const h of this.removals.values()) clearTimeout(h)
    this.removals.clear()
    this.opts.doc?.removeEventListener('visibilitychange', this.onVisibility)
  }

  private scheduleRemoval(id: string): void {
    this.clearRemoval(id)
    this.removals.set(
      id,
      setTimeout(() => {
        this.removals.delete(id)
        const timer = this.opts.store.getTimers().find((t) => t.id === id)
        this.opts.store.removeTimer(id)
        this.syncInterval()
        if (timer) this.opts.onRingEnd?.(timer)
      }, this.opts.ringMs ?? TIMER_RING_MS),
    )
  }

  private clearRemoval(id: string): void {
    const h = this.removals.get(id)
    if (h) clearTimeout(h)
    this.removals.delete(id)
  }

  /** Poll only while something is counting down. */
  private syncInterval(): void {
    const needed = this.active.length > 0
    if (needed && !this.interval) this.interval = setInterval(() => this.check(), CHECK_MS)
    else if (!needed && this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }
}
