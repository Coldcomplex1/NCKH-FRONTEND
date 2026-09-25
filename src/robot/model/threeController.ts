import {
  LoopOnce,
  LoopRepeat,
  Quaternion,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type AnimationMixer,
  type Mesh,
  type Object3D,
} from 'three'
import type { Expression } from '@/core/robot'
import { HOLD_CLIPS } from '@/engine/spec'
import type {
  AnimationController,
  ClipName,
  LoopClip,
  OnceClip,
  PlayOptions,
  Pose,
  PoseClip,
  Vec2,
} from '@/engine/types'
import { clamp, easeInOutCubic, normalizeAngle, shortestDelta, trapezoidProgress } from './math'

/**
 * The AnimationController for the 3D robot (three.js). Created by <Robot/> once the model is
 * loaded; ticked from a single useFrame. Every promise resolves (never rejects): on completion, on
 * `cancel()`, or when its watchdog expires. All times are CONTROLLER time (it only advances while the
 * canvas renders), so an off-screen robot simply pauses.
 */

export interface ThreeControllerDeps {
  mixer: AnimationMixer
  clips: Partial<Record<ClipName, AnimationClip>>
  /** Outer group: x/z position and rotation.y (yaw). The mixer never animates it. */
  root: Object3D
  /** Model root (the mixer root): "model space" for the head overlay. */
  model: Object3D
  faceMeshes: Mesh[]
  headBone: Object3D | null
}

export interface ThreeController extends AnimationController {
  /** Advance by `dt` seconds (the caller clamps dt). */
  tick(dt: number): void
  /** Stop everything, undo overlays, resolve pending promises, remove listeners. */
  dispose(): void
  /** Controller time, seconds. */
  readonly time: number
}

export const EXPRESSIONS: readonly Expression[] = ['Angry', 'Surprised', 'Sad']

const DEFAULT_ONCE_FADE = 0.2
const DEFAULT_BASE_FADE = 0.4
const RETURN_FADE = 0.25
const CANCEL_FADE = 0.3
const MOVE_RAMP = 0.3
/** Extra controller seconds before a lost `finished` event is assumed. */
const WATCHDOG_SLACK = 1
const POSE_CLIPS = new Set<OnceClip>(['Sitting', 'Standing', 'Death'])

type Resolve = () => void

interface Tween {
  start: number
  dur: number
  resolve: Resolve | null
  apply(k: number): void
}

interface OneShot {
  clip: OnceClip
  action: AnimationAction
  deadline: number
  resolve: Resolve | null
}

export function createThreeController(deps: ThreeControllerDeps): ThreeController {
  const { mixer, clips, root, model, faceMeshes, headBone } = deps

  let time = 0
  let disposed = false

  // ---- clip actions
  const actions = new Map<ClipName, AnimationAction>()
  for (const [name, clip] of Object.entries(clips) as [ClipName, AnimationClip][]) {
    actions.set(name, mixer.clipAction(clip))
  }

  let base: LoopClip = 'Idle'
  let baseTimeScale = 1
  /** The action currently faded in at full weight (base loop, a one-shot, or a held pose). */
  let active: AnimationAction | null = null
  let oneShot: OneShot | null = null
  /** A pose clip that finished and holds its last frame (Sitting / Death). */
  let held: AnimationAction | null = null

  function fadeTo(next: AnimationAction, fade: number, timeScale: number): void {
    const prev = active
    next.reset().setEffectiveTimeScale(timeScale).setEffectiveWeight(1)
    // Replaying the active action restarts it at full weight: fading it in from 0 with nothing
    // else weighted would blend toward the bind pose for a moment.
    if (prev && prev !== next) {
      prev.fadeOut(fade)
      next.fadeIn(fade)
    }
    next.play()
    active = next
  }

  function baseAction(): AnimationAction | undefined {
    return actions.get(base)
  }

  function returnToBase(fade: number): void {
    const a = baseAction()
    held = null
    if (a) fadeTo(a, fade, baseTimeScale)
  }

  function finishOneShot(): void {
    const shot = oneShot
    if (!shot) return
    oneShot = null
    if (HOLD_CLIPS.has(shot.clip)) {
      held = shot.action
      active = shot.action
    } else {
      returnToBase(RETURN_FADE)
    }
    shot.resolve?.()
  }

  const onFinished = (e: { action: AnimationAction }) => {
    if (oneShot && e.action === oneShot.action) finishOneShot()
  }
  mixer.addEventListener('finished', onFinished)

  // Start in the base loop.
  const idle = baseAction()
  if (idle) {
    idle.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play()
    active = idle
  }

  // ---- tweens (one per channel; a new call supersedes and resolves the previous one)
  let move: Tween | null = null
  let turn: Tween | null = null
  let exprTween: Tween | null = null
  let headTween: Tween | null = null
  let waits: { until: number; resolve: Resolve }[] = []

  const exprWeights: Record<Expression, number> = { Angry: 0, Surprised: 0, Sad: 0 }
  const headState = { pitch: 0, roll: 0, yaw: 0 }

  function supersede(t: Tween | null): void {
    t?.resolve?.()
  }

  function startTween(dur: number, apply: (k: number) => void, withPromise: boolean) {
    let resolve: Resolve | null = null
    const promise = withPromise ? new Promise<void>((r) => (resolve = r)) : Promise.resolve()
    const tween: Tween = { start: time, dur: Math.max(0, dur), resolve, apply }
    return { tween, promise }
  }

  /** Advance one tween; returns it while it is still running. */
  function stepTween(t: Tween | null): Tween | null {
    if (!t) return null
    const k = t.dur <= 0 ? 1 : clamp((time - t.start) / t.dur, 0, 1)
    t.apply(k)
    if (k >= 1) {
      t.resolve?.()
      return null
    }
    return t
  }

  // ---- head overlay (undo → mixer.update → reapply, so a held pose never accumulates offsets)
  const lastOverlay = new Quaternion()
  const tmpQ = new Quaternion()
  const parentQ = new Quaternion()
  const overlayQ = new Quaternion()
  const X_AXIS = new Vector3(1, 0, 0)
  const Y_AXIS = new Vector3(0, 1, 0)
  const Z_AXIS = new Vector3(0, 0, 1)
  const rollQ = new Quaternion()
  const yawQ = new Quaternion()

  function undoHeadOverlay(): void {
    if (!headBone) return
    tmpQ.copy(lastOverlay).invert()
    // Normalize: glTF quaternions are float32-precise, so conjugate-as-inverse would slowly shrink
    // the bone quaternion over thousands of frames.
    headBone.quaternion.premultiply(tmpQ).normalize()
    lastOverlay.identity()
  }

  function applyHeadOverlay(): void {
    if (
      !headBone ||
      (Math.abs(headState.pitch) < 1e-4 && Math.abs(headState.roll) < 1e-4 && Math.abs(headState.yaw) < 1e-4)
    )
      return
    // Model-space rotation: yaw about Y (a "no" shake), pitch about X (> 0 looks down, the face is
    // at +Z), roll about Z. Q = Ry · Rx · Rz (identical to the old Rx · Rz when yaw is 0).
    yawQ.setFromAxisAngle(Y_AXIS, headState.yaw)
    overlayQ.setFromAxisAngle(X_AXIS, headState.pitch)
    rollQ.setFromAxisAngle(Z_AXIS, headState.roll)
    overlayQ.premultiply(yawQ).multiply(rollQ)
    // Parent orientation relative to the model root: walk up the local quaternions.
    parentQ.identity()
    for (let o = headBone.parent; o && o !== model; o = o.parent) parentQ.premultiply(o.quaternion)
    parentQ.normalize()
    // Local overlay O = P⁻¹ · Qm · P, applied as bone.q = O · bone.q.
    tmpQ.copy(parentQ).invert().multiply(overlayQ).multiply(parentQ).normalize()
    headBone.quaternion.premultiply(tmpQ)
    lastOverlay.copy(tmpQ)
  }

  function writeExpressions(): void {
    for (const mesh of faceMeshes) {
      const dict = mesh.morphTargetDictionary
      const infl = mesh.morphTargetInfluences
      if (!dict || !infl) continue
      for (const name of EXPRESSIONS) {
        const idx = dict[name]
        if (idx !== undefined) infl[idx] = exprWeights[name]
      }
    }
  }

  function resolveWaits(all: boolean): void {
    if (waits.length === 0) return
    const keep: typeof waits = []
    for (const w of waits) {
      if (all || time >= w.until) w.resolve()
      else keep.push(w)
    }
    waits = keep
  }

  const ctrl: ThreeController = {
    kind: 'three',

    get time() {
      return time
    },

    play(clip: OnceClip, opts: PlayOptions = {}): Promise<void> {
      const action = actions.get(clip)
      if (!action || disposed) return Promise.resolve()
      // A newer one-shot supersedes the previous one (it crossfades from it).
      if (oneShot) {
        const prev = oneShot
        oneShot = null
        prev.resolve?.()
      }
      const repeat = Math.max(1, Math.round(opts.repeat ?? 1))
      const ts = opts.timeScale ?? 1
      const fade = Math.max(0, opts.fade ?? DEFAULT_ONCE_FADE)
      action.setLoop(repeat > 1 ? LoopRepeat : LoopOnce, repeat)
      action.clampWhenFinished = true
      held = null
      fadeTo(action, fade, ts)
      const clipDur = action.getClip().duration
      const expected = (clipDur * repeat) / Math.max(0.05, Math.abs(ts))
      return new Promise<void>((resolve) => {
        oneShot = { clip, action, deadline: time + expected + fade + WATCHDOG_SLACK, resolve }
      })
    },

    setBase(clip: LoopClip, opts: { fade?: number; timeScale?: number } = {}): void {
      if (disposed) return
      const ts = opts.timeScale ?? 1
      const fade = Math.max(0, opts.fade ?? DEFAULT_BASE_FADE)
      const sameClip = clip === base
      base = clip
      baseTimeScale = ts
      // A one-shot in progress returns to the new base when it ends; a held pose stays held.
      if (oneShot || held) return
      const a = baseAction()
      if (!a) return
      if (sameClip && active === a) {
        a.setEffectiveTimeScale(ts)
        return
      }
      fadeTo(a, fade, ts)
    },

    holdPose(clip: PoseClip): void {
      const action = actions.get(clip)
      if (!action || disposed) return
      if (oneShot) {
        const prev = oneShot
        oneShot = null
        prev.resolve?.()
      }
      // Straight to the last frame, full weight, no crossfade: the same state a finished Sitting /
      // Death one-shot leaves behind (held, clamped), so Standing releases it as usual.
      if (active && active !== action) active.stop()
      action.reset()
      action.setLoop(LoopOnce, 1)
      action.clampWhenFinished = true
      action.setEffectiveTimeScale(1).setEffectiveWeight(1)
      action.play()
      action.time = action.getClip().duration
      held = action
      active = action
    },

    expression(name: Expression | null, weight = 1, durationMs = 300): Promise<void> {
      if (disposed) return Promise.resolve()
      supersede(exprTween)
      const from = { ...exprWeights }
      const w = clamp(weight, 0, 1)
      const { tween, promise } = startTween(
        durationMs / 1000,
        (k) => {
          const e = easeInOutCubic(k)
          for (const n of EXPRESSIONS) {
            const to = n === name ? w : 0
            exprWeights[n] = from[n] + (to - from[n]) * e
          }
        },
        true,
      )
      exprTween = tween
      return promise
    },

    head(target: { pitch?: number; roll?: number; yaw?: number }, durationMs = 400): Promise<void> {
      if (disposed) return Promise.resolve()
      supersede(headTween)
      const from = { ...headState }
      const to = {
        pitch: clamp(target.pitch ?? headState.pitch, -0.8, 0.8),
        roll: clamp(target.roll ?? headState.roll, -0.8, 0.8),
        yaw: clamp(target.yaw ?? headState.yaw, -0.8, 0.8),
      }
      const { tween, promise } = startTween(
        durationMs / 1000,
        (k) => {
          const e = easeInOutCubic(k)
          headState.pitch = from.pitch + (to.pitch - from.pitch) * e
          headState.roll = from.roll + (to.roll - from.roll) * e
          headState.yaw = from.yaw + (to.yaw - from.yaw) * e
        },
        true,
      )
      headTween = tween
      return promise
    },

    moveTo(target: Vec2, opts: { speed: number }): Promise<void> {
      if (disposed) return Promise.resolve()
      supersede(move)
      const fromX = root.position.x
      const fromZ = root.position.z
      const dist = Math.hypot(target.x - fromX, target.z - fromZ)
      if (dist < 1e-3) {
        move = null
        return Promise.resolve()
      }
      const cruise = dist / Math.max(0.05, opts.speed)
      const total = cruise + Math.min(MOVE_RAMP, cruise)
      const { tween, promise } = startTween(
        total,
        (k) => {
          const p = trapezoidProgress(k * total, total, MOVE_RAMP)
          root.position.x = fromX + (target.x - fromX) * p
          root.position.z = fromZ + (target.z - fromZ) * p
        },
        true,
      )
      move = tween
      return promise
    },

    turnTo(yaw: number, opts: { extraTurns?: number; durationMs: number }): Promise<void> {
      if (disposed) return Promise.resolve()
      supersede(turn)
      const from = root.rotation.y
      const delta = shortestDelta(from, yaw)
      const extra = Math.max(0, Math.round(opts.extraTurns ?? 0))
      const dir = delta < 0 ? -1 : 1
      const total = delta + dir * extra * Math.PI * 2
      if (Math.abs(total) < 1e-4) {
        turn = null
        return Promise.resolve()
      }
      const { tween, promise } = startTween(
        opts.durationMs / 1000,
        (k) => {
          root.rotation.y = from + total * easeInOutCubic(k)
          if (k >= 1) root.rotation.y = normalizeAngle(root.rotation.y)
        },
        true,
      )
      turn = tween
      return promise
    },

    wait(ms: number): Promise<void> {
      if (disposed || ms <= 0) return Promise.resolve()
      return new Promise<void>((resolve) => waits.push({ until: time + ms / 1000, resolve }))
    },

    getPose(): Pose {
      return { x: root.position.x, z: root.position.z, yaw: normalizeAngle(root.rotation.y) }
    },

    settle(): void {
      if (disposed) return
      ctrl.setBase('Idle', { fade: 0.35 })
      void ctrl.expression(null, 0, 350)
      void ctrl.head({ pitch: 0, roll: 0, yaw: 0 }, 350)
    },

    cancel(opts: { fade?: number } = {}): void {
      if (disposed) return
      const fade = Math.max(0, opts.fade ?? CANCEL_FADE)
      // Tweens stop where they are.
      for (const t of [move, turn, exprTween, headTween]) t?.resolve?.()
      move = turn = exprTween = headTween = null
      resolveWaits(true)
      // An emote fades out now; a pose clip (sit / stand / fall) finishes, so the body matches the
      // posture the engine already recorded. Held poses are kept.
      const shot = oneShot
      if (shot) {
        shot.resolve?.()
        shot.resolve = null
        if (!POSE_CLIPS.has(shot.clip)) oneShot = null
      }
      // Moving loops make no sense without the move: back to Idle unless a pose holds / plays.
      base = 'Idle'
      baseTimeScale = 1
      if (!oneShot && !held) {
        const a = baseAction()
        if (a && active !== a) fadeTo(a, fade, 1)
        else a?.setEffectiveTimeScale(1)
      }
    },

    tick(dt: number): void {
      if (disposed) return
      undoHeadOverlay()
      mixer.update(dt)
      time += dt
      move = stepTween(move)
      turn = stepTween(turn)
      exprTween = stepTween(exprTween)
      headTween = stepTween(headTween)
      applyHeadOverlay()
      writeExpressions()
      if (oneShot && time >= oneShot.deadline) finishOneShot()
      resolveWaits(false)
    },

    dispose(): void {
      if (disposed) return
      ctrl.cancel({ fade: 0 })
      if (oneShot) {
        oneShot.resolve?.()
        oneShot = null
      }
      disposed = true
      mixer.removeEventListener('finished', onFinished)
      undoHeadOverlay()
      headState.pitch = headState.roll = headState.yaw = 0
      for (const n of EXPRESSIONS) exprWeights[n] = 0
      writeExpressions()
      mixer.stopAllAction()
      mixer.uncacheRoot(model)
    },
  }

  return ctrl
}
