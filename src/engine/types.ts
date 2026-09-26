import type { InfoCard } from '@/core/engine'
import type { Lang } from '@/core/lang'
import type { PlaceRef } from '@/core/places'
import type { ReplyRef } from '@/core/replies'
import type { Expression, RobotSemanticState } from '@/core/robot'
import type { RoomState } from '@/core/room'
import type { MotionScript } from '@/motion/script'

/**
 * Engine-internal types. The engine is plain TypeScript (no React, no three.js): it talks to the
 * 3D scene only through the `AnimationController` interface below, which `src/robot` implements.
 */

// ---- clips (names as they appear in RobotExpressive.glb)

export type LoopClip = 'Idle' | 'Walking' | 'Running' | 'Dance'
/** Pose clips hold their last frame (LoopOnce + clampWhenFinished). */
export type PoseClip = 'Sitting' | 'Standing' | 'Death'
/** One-shot gestures; after they finish the controller fades back to the base loop. */
export type EmoteClip = 'Jump' | 'Yes' | 'No' | 'Wave' | 'Punch' | 'ThumbsUp'
export type OnceClip = PoseClip | EmoteClip
export type ClipName = LoopClip | OnceClip

// ---- geometry (metres; floor plane x/z; yaw 0 = facing the camera on +Z; +yaw turns toward +X)

export interface Vec2 {
  x: number
  z: number
}

export interface Pose extends Vec2 {
  yaw: number
}

export type RoomPatch = { light?: Partial<RoomState['light']>; fan?: Partial<RoomState['fan']> }

// ---- plan steps (serializable, so plans can be unit-tested and snapshotted)

export type Step =
  /** Change the looping base animation (Idle/Walking/Running/Dance). */
  | { op: 'base'; clip: LoopClip; fade?: number; timeScale?: number }
  /** Play a one-shot clip `repeat` times; resolves when it finishes. */
  | { op: 'clip'; clip: OnceClip; repeat?: number; timeScale?: number; fade?: number }
  /**
   * Wait in controller time (pauses while the canvas is offscreen). Without a controller it is a
   * short wall-clock pause instead (≤ NO_BODY_HOLD_MAX_MS), so the 2D robot shows the activity.
   */
  | { op: 'hold'; ms: number }
  /** `ms` = the planner's duration estimate (used for the body-less pause, like 'hold'). */
  | { op: 'move'; to: Vec2; speed: number; ms?: number }
  /** Turn to an absolute yaw by the shortest way, plus `extraTurns` full turns (spins). */
  | { op: 'turn'; yaw: number; extraTurns?: number; ms: number }
  | { op: 'expr'; name: Expression | null; weight?: number; ms?: number }
  /**
   * Procedural head overlay in model space: pitch > 0 looks down, roll tilts sideways, yaw turns the
   * head (a seated "no" shake). Omitted angles keep their current value.
   */
  | { op: 'head'; pitch?: number; roll?: number; yaw?: number; ms?: number }
  /**
   * An AI-invented move (a MotionScript compiled onto the skeleton), performed `count` times while
   * the root glides to `to` (already clamped to the room). `loop` = repeat until cancelled (the
   * thinking pose). `ms` = the planner's duration estimate (watchdog, and the body-less pause).
   */
  | {
      op: 'script'
      move: MotionScript
      count: number
      to: Vec2
      timeScale: number
      loop?: boolean
      ms: number
    }
  /**
   * Show + announce a reply and (unless muted) speak it. `wait` = blocking (the plan waits for the
   * speech). `silent` = bubble only (no TTS, no live region, not added to the turn): the welcome.
   */
  | { op: 'say'; reply: ReplyRef; wait: boolean; assertive?: boolean; silent?: boolean }
  | { op: 'card'; card: InfoCard; ttlMs: number | null }
  | { op: 'room'; patch: RoomPatch }
  | { op: 'robot'; patch: Partial<RobotSemanticState> }
  | { op: 'pref'; lang?: Lang; muted?: boolean }
  | { op: 'timer_start'; seconds: number; label?: string }
  /** label set = only the timer(s) with that label; none = every timer. */
  | { op: 'timer_cancel'; label?: string }
  | { op: 'timer_status' }
  | { op: 'weather'; place: PlaceRef; dayOffset: 0 | 1 | 2; aspect: 'general' | 'rain' | 'temp' }
  | { op: 'beep' }
  | { op: 'parallel'; steps: Step[] }
  | { op: 'seq'; steps: Step[] }

export type StepOp = Step['op']

/** Ops that drive the robot's body; they are skipped when no controller is attached. */
export const BODY_OPS: ReadonlySet<StepOp> = new Set<StepOp>([
  'base',
  'clip',
  'hold',
  'move',
  'turn',
  'expr',
  'head',
  'script',
])

// ---- the controller the 3D scene (or a test double) implements

export interface PlayOptions {
  /** Crossfade seconds. Default 0.2. */
  fade?: number
  /** Total plays (LoopRepeat n). Default 1. */
  repeat?: number
  timeScale?: number
}

export interface PerformOptions {
  /** Performances of the whole move (each plays all of its loops). */
  count: number
  /** Where the root ends (floor x/z), reached linearly over the performance. */
  to: Vec2
  timeScale?: number
  /** Repeat until cancelled (the thinking pose); `count` and `to` are then ignored. */
  loop?: boolean
}

/**
 * Drives the robot's body. Every promise resolves (never rejects): on completion, on `cancel()`,
 * or when its watchdog (measured in controller time) expires, so a lost `finished` event can never
 * stall the engine's queue.
 */
export interface AnimationController {
  readonly kind: 'three' | 'fake'
  /** One-shot clip. Emotes and Standing fade back to the base loop; Sitting/Death hold their pose. */
  play(clip: OnceClip, opts?: PlayOptions): Promise<void>
  setBase(clip: LoopClip, opts?: { fade?: number; timeScale?: number }): void
  /**
   * Snap into a pose clip's last frame and hold it, without animating: a body that attaches after
   * the engine recorded sitting / sleeping / lying (slow model load, WebGL context restored) adopts
   * that posture at once, so the store and the body agree. Standing releases it as usual.
   */
  holdPose(clip: PoseClip): void
  expression(name: Expression | null, weight?: number, durationMs?: number): Promise<void>
  head(target: { pitch?: number; roll?: number; yaw?: number }, durationMs?: number): Promise<void>
  /** Straight-line move of the root at `speed` m/s (the base loop provides the leg motion). */
  moveTo(target: Vec2, opts: { speed: number }): Promise<void>
  turnTo(yaw: number, opts: { extraTurns?: number; durationMs: number }): Promise<void>
  /** An AI-invented move; resolves after its last loop (or on cancel). No-op without a rig. */
  perform(move: MotionScript, opts: PerformOptions): Promise<void>
  /** Resolves after `ms` of controller time. */
  wait(ms: number): Promise<void>
  /** Transient pose, read from refs (never from the store). */
  getPose(): Pose
  /** End of a run: base Idle (unless a pose is held), neutral face, head straight. */
  settle(): void
  /** Stop tweens where they are and resolve every pending promise. Held poses are kept. */
  cancel(opts?: { fade?: number }): void
}

/** What the planner knows about the world when a request arrives. */
export interface PlannerSnapshot {
  now: Date
  posture: RobotSemanticState['posture']
  pose: Pose
  room: RoomState
  reducedMotion: boolean
  /** Rotating index for 'chat.joke'. */
  jokeIndex: number
  /** Test WER fraction for the 'project' intro. */
  projectWer?: number
}

export interface Plan {
  steps: Step[]
  /** true when the request asked for body motion (the engine then waits for the controller). */
  needsBody: boolean
  /** Jokes consumed (the engine advances its rotating index). */
  jokesUsed: number
}
