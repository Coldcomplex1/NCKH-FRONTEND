import type { Expression } from '@/core/robot'
import { CLIP_DURATION, HOLD_CLIPS } from './spec'
import { motionSeconds, type MotionScript } from '@/motion/script'
import type {
  AnimationController,
  LoopClip,
  OnceClip,
  PerformOptions,
  PlayOptions,
  Pose,
  PoseClip,
  Vec2,
} from './types'

/**
 * A test double for the 3D robot (node tests, no WebGL). It records every call and resolves its
 * promises after the durations the real controller would take, in VIRTUAL time:
 * - `mode: 'timers'` (default): durations × `scale` via setTimeout, so `vi.useFakeTimers()` drives
 *   the controller and the engine's own sleeps together;
 * - `mode: 'manual'`: nothing resolves until the test calls `advance(ms)`.
 * `scale: 0` makes every animation resolve on the next microtask.
 */

export interface FakeCall {
  method:
    | 'play'
    | 'holdPose'
    | 'setBase'
    | 'expression'
    | 'head'
    | 'moveTo'
    | 'turnTo'
    | 'perform'
    | 'wait'
    | 'settle'
    | 'cancel'
  args: unknown[]
  /** Controller time (ms) when the call was made. */
  at: number
}

export interface FakeControllerOptions {
  mode?: 'timers' | 'manual'
  /** Duration multiplier (1 = real clip lengths). */
  scale?: number
  pose?: Pose
}

interface Pending {
  due: number
  timer: ReturnType<typeof setTimeout> | null
  resolve(): void
  onDone?: () => void
  onCancel?: (fraction: number) => void
  startedAt: number
}

export class FakeController implements AnimationController {
  readonly kind = 'fake' as const
  readonly calls: FakeCall[] = []
  pose: Pose
  base: LoopClip = 'Idle'
  /** Sitting / Death hold their last frame until Standing plays. */
  heldPose: OnceClip | null = null
  face: Expression | null = null
  headPose = { pitch: 0, roll: 0, yaw: 0 }

  private readonly mode: 'timers' | 'manual'
  private readonly scale: number
  private readonly pending = new Set<Pending>()
  private clock = 0
  private readonly realStart = Date.now()

  constructor(opts: FakeControllerOptions = {}) {
    this.mode = opts.mode ?? 'timers'
    this.scale = opts.scale ?? 1
    this.pose = opts.pose ? { ...opts.pose } : { x: 0, z: 0, yaw: 0 }
  }

  /** Controller time in ms. */
  get time(): number {
    return this.mode === 'manual' ? this.clock : Date.now() - this.realStart
  }

  /** Number of animations still running. */
  get busy(): number {
    return this.pending.size
  }

  /** Method names in call order, e.g. ['setBase:Walking', 'turnTo', 'moveTo', 'play:Jump']. */
  get log(): string[] {
    return this.calls.map((c) => {
      const a0 = c.args[0]
      return typeof a0 === 'string' ? `${c.method}:${a0}` : c.method
    })
  }

  played(clip: OnceClip): number {
    return this.calls.filter((c) => c.method === 'play' && c.args[0] === clip).length
  }

  /** Manual mode: move controller time forward, resolving whatever finishes (in order). */
  advance(ms: number): void {
    const target = this.clock + ms
    for (;;) {
      const next = [...this.pending].filter((p) => p.due <= target).sort((a, b) => a.due - b.due)[0]
      if (!next) break
      this.clock = next.due
      this.finish(next)
    }
    this.clock = target
  }

  play(clip: OnceClip, opts: PlayOptions = {}): Promise<void> {
    this.record('play', [clip, opts])
    const repeat = opts.repeat ?? 1
    const ts = Math.abs(opts.timeScale ?? 1) || 1
    if (HOLD_CLIPS.has(clip)) this.heldPose = clip
    else if (clip === 'Standing') this.heldPose = null
    return this.later((CLIP_DURATION[clip] * 1000 * repeat) / ts)
  }

  holdPose(clip: PoseClip): void {
    this.record('holdPose', [clip])
    this.heldPose = clip
  }

  setBase(clip: LoopClip, opts?: { fade?: number; timeScale?: number }): void {
    this.record('setBase', [clip, opts])
    this.base = clip
  }

  expression(name: Expression | null, weight?: number, durationMs?: number): Promise<void> {
    this.record('expression', [name, weight, durationMs])
    this.face = name
    return this.later(durationMs ?? 0)
  }

  head(target: { pitch?: number; roll?: number; yaw?: number }, durationMs?: number): Promise<void> {
    this.record('head', [target, durationMs])
    this.headPose = {
      pitch: target.pitch ?? this.headPose.pitch,
      roll: target.roll ?? this.headPose.roll,
      yaw: target.yaw ?? this.headPose.yaw,
    }
    return this.later(durationMs ?? 0)
  }

  moveTo(target: Vec2, opts: { speed: number }): Promise<void> {
    this.record('moveTo', [target, opts])
    const from = { x: this.pose.x, z: this.pose.z }
    const ms = (Math.hypot(target.x - from.x, target.z - from.z) / Math.max(0.05, opts.speed)) * 1000
    return this.later(
      ms,
      () => {
        this.pose.x = target.x
        this.pose.z = target.z
      },
      (f) => {
        this.pose.x = from.x + (target.x - from.x) * f
        this.pose.z = from.z + (target.z - from.z) * f
      },
    )
  }

  turnTo(yaw: number, opts: { extraTurns?: number; durationMs: number }): Promise<void> {
    this.record('turnTo', [yaw, opts])
    return this.later(opts.durationMs, () => {
      this.pose.yaw = yaw
    })
  }

  /** Resolves after all loops × count (virtual time); a looping performance only on cancel. */
  perform(move: MotionScript, opts: PerformOptions): Promise<void> {
    this.record('perform', [move.name?.en ?? 'move', opts])
    if (opts.loop) return this.later(Number.POSITIVE_INFINITY)
    const from = { x: this.pose.x, z: this.pose.z }
    const ts = Math.abs(opts.timeScale ?? 1) || 1
    const ms = (motionSeconds(move) * Math.max(1, opts.count) * 1000) / ts
    return this.later(
      ms,
      () => {
        this.pose.x = opts.to.x
        this.pose.z = opts.to.z
      },
      (f) => {
        this.pose.x = from.x + (opts.to.x - from.x) * f
        this.pose.z = from.z + (opts.to.z - from.z) * f
      },
    )
  }

  wait(ms: number): Promise<void> {
    this.record('wait', [ms])
    return this.later(ms)
  }

  getPose(): Pose {
    return { ...this.pose }
  }

  settle(): void {
    this.record('settle', [])
    if (!this.heldPose) this.base = 'Idle'
    this.face = null
    this.headPose = { pitch: 0, roll: 0, yaw: 0 }
  }

  cancel(opts?: { fade?: number }): void {
    this.record('cancel', [opts])
    for (const p of [...this.pending]) {
      if (p.timer) clearTimeout(p.timer)
      this.pending.delete(p)
      const span = p.due - p.startedAt
      p.onCancel?.(span > 0 ? Math.min(1, Math.max(0, (this.time - p.startedAt) / span)) : 1)
      p.resolve()
    }
  }

  private record(method: FakeCall['method'], args: unknown[]): void {
    this.calls.push({ method, args, at: this.time })
  }

  private later(ms: number, onDone?: () => void, onCancel?: (fraction: number) => void): Promise<void> {
    return new Promise<void>((resolve) => {
      const scaled = Math.max(0, ms * this.scale)
      const p: Pending = {
        due: this.time + scaled,
        timer: null,
        resolve,
        onDone,
        onCancel,
        startedAt: this.time,
      }
      this.pending.add(p)
      if (this.mode === 'manual') {
        if (scaled === 0) this.finish(p)
        return
      }
      if (scaled === 0) queueMicrotask(() => this.finish(p))
      else if (Number.isFinite(scaled)) p.timer = setTimeout(() => this.finish(p), scaled)
    })
  }

  private finish(p: Pending): void {
    if (!this.pending.delete(p)) return
    if (p.timer) clearTimeout(p.timer)
    p.onDone?.()
    p.resolve()
  }
}
