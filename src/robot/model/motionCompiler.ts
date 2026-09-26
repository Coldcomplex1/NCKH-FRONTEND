import {
  AnimationClip,
  NumberKeyframeTrack,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
  type Interpolant,
  type KeyframeTrack,
} from 'three'
import { JOINT_NAMES, type Joint, type MotionKey, type MotionScript } from '@/motion/script'
import { FACE_TARGETS } from './faceMorphs'
import { SIDE_SIGN, SIDES, type MotionRig, type Side } from './motionRig'

/**
 * Compiles a MotionScript into a three.js AnimationClip for RobotExpressive. One loop is sampled at
 * 30 fps; for every sample the semantic joints (degrees, the robot's own frame) become bone
 * rotations through a quaternion FK over the captured rest rig, the feet are re-attached to the shin
 * ends (they hang off the root bone in this model), the lowest body point is put at `lift` above the
 * floor (so a crouch sinks and a roll touches the floor), and whole-body flips turn the root bone
 * about hip height. The clip then plays through the controller's normal crossfade machinery.
 */

export const MOTION_FPS = 30

export interface CompiledMotion {
  clip: AnimationClip
  /** Seconds per loop (= clip duration). */
  loopSeconds: number
}

const DEG = Math.PI / 180
const X = new Vector3(1, 0, 0)
const Y = new Vector3(0, 1, 0)
const Z = new Vector3(0, 0, 1)
const DOWN = new Vector3(0, -1, 0)

// ------------------------------------------------------------------------------ interpolation

/** Monotone cubic (PCHIP) tangents: smooth, never overshoots, and equal keys hold still. */
function tangents(ts: number[], vs: number[], periodic: boolean, period: number): number[] {
  const n = vs.length
  const m = new Array<number>(n).fill(0)
  if (n < 2) return m
  const slope = (i: number, j: number, dt: number) => (dt <= 1e-9 ? 0 : (vs[j]! - vs[i]!) / dt)
  for (let k = 0; k < n; k++) {
    let prev: number | null = null
    let next: number | null = null
    let hPrev = 0
    let hNext = 0
    if (k > 0) {
      hPrev = ts[k]! - ts[k - 1]!
      prev = slope(k - 1, k, hPrev)
    } else if (periodic) {
      hPrev = ts[0]! + period - ts[n - 1]!
      prev = slope(n - 1, 0, hPrev)
    }
    if (k < n - 1) {
      hNext = ts[k + 1]! - ts[k]!
      next = slope(k, k + 1, hNext)
    } else if (periodic) {
      hNext = ts[0]! + period - ts[n - 1]!
      next = slope(n - 1, 0, hNext)
    }
    if (prev === null || next === null) continue // ends of a non-periodic move ease in/out
    if (prev * next <= 0) continue
    const w1 = 2 * hNext + hPrev
    const w2 = hNext + 2 * hPrev
    m[k] = (w1 + w2) / (w1 / prev + w2 / next)
  }
  return m
}

/**
 * One scalar channel over the keys. Non-periodic: holds the last value after the last key.
 * Periodic: eases from the last key back to the first over (lastT, period].
 */
class Channel {
  private readonly ts: number[]
  private readonly vs: number[]
  private readonly periodic: boolean
  private readonly period: number
  private readonly m: number[]

  constructor(ts: number[], vs: number[], periodic: boolean, period: number) {
    this.ts = ts
    this.vs = vs
    this.periodic = periodic
    this.period = period
    this.m = tangents(ts, vs, periodic, period)
  }

  at(t: number): number {
    const { ts, vs, m } = this
    const n = ts.length
    if (n === 1) return vs[0]!
    if (t <= ts[0]!) return vs[0]!
    let i = n - 1
    let t0: number
    let t1: number
    let v0: number
    let v1: number
    let m0: number
    let m1: number
    if (t >= ts[n - 1]!) {
      if (!this.periodic) return vs[n - 1]!
      t0 = ts[n - 1]!
      t1 = this.period
      v0 = vs[n - 1]!
      v1 = vs[0]!
      m0 = m[n - 1]!
      m1 = m[0]!
    } else {
      while (i > 0 && ts[i]! > t) i--
      t0 = ts[i]!
      t1 = ts[i + 1]!
      v0 = vs[i]!
      v1 = vs[i + 1]!
      m0 = m[i]!
      m1 = m[i + 1]!
    }
    const h = t1 - t0
    if (h <= 1e-9) return v1
    const s = (t - t0) / h
    const s2 = s * s
    const s3 = s2 * s
    return (
      (2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * h * m1
    )
  }
}

// ------------------------------------------------------------------------------ rotations

const tmpA = new Quaternion()
const tmpB = new Quaternion()
const tmpC = new Quaternion()

/** R = Ry(yaw) · Rx(pitch) · Rz(−roll), degrees, model space. */
function yawPitchRoll(yaw: number, pitch: number, roll: number, out: Quaternion): Quaternion {
  tmpA.setFromAxisAngle(Y, yaw * DEG)
  tmpB.setFromAxisAngle(X, pitch * DEG)
  tmpC.setFromAxisAngle(Z, -roll * DEG)
  return out.copy(tmpA).multiply(tmpB).multiply(tmpC)
}

const hDir = new Vector3()
const axis = new Vector3()
const limbDir = new Vector3()
const twistQ = new Quaternion()

/** Swing from hanging straight down to (raise, dir), then twist about the limb. */
function limbRotation(side: Side, raise: number, dir: number, twist: number, out: Quaternion): Quaternion {
  const s = SIDE_SIGN[side]
  hDir.set(Math.sin(dir * DEG) * s, 0, Math.cos(dir * DEG))
  axis.crossVectors(DOWN, hDir).normalize()
  out.setFromAxisAngle(axis, raise * DEG)
  limbDir.copy(DOWN).applyQuaternion(out)
  twistQ.setFromAxisAngle(limbDir, -twist * s * DEG)
  return out.premultiply(twistQ)
}

// ------------------------------------------------------------------------------ FK workspace

interface Workspace {
  localQ: Quaternion[]
  localP: Vector3[]
  worldQ: Quaternion[]
  worldP: Vector3[]
  worldS: number[]
}

function workspace(rig: MotionRig): Workspace {
  return {
    localQ: rig.nodes.map((n) => n.quat.clone()),
    localP: rig.nodes.map((n) => n.pos.clone()),
    worldQ: rig.nodes.map(() => new Quaternion()),
    worldP: rig.nodes.map(() => new Vector3()),
    worldS: rig.nodes.map(() => 1),
  }
}

/** World transform of node i from its parent's world transform and its own local one. */
function place(rig: MotionRig, ws: Workspace, i: number): void {
  const p = rig.nodes[i]!.parent
  const s = rig.nodes[i]!.scale
  if (p < 0) {
    ws.worldQ[i]!.copy(ws.localQ[i]!)
    ws.worldP[i]!.copy(ws.localP[i]!)
    ws.worldS[i] = s
    return
  }
  ws.worldQ[i]!.copy(ws.worldQ[p]!).multiply(ws.localQ[i]!)
  ws.worldP[i]!.copy(ws.localP[i]!)
    .multiplyScalar(ws.worldS[p]!)
    .applyQuaternion(ws.worldQ[p]!)
    .add(ws.worldP[p]!)
  ws.worldS[i] = ws.worldS[p]! * s
}

/** Set node i's local rotation so that its world rotation becomes `world` (parent already placed). */
function orient(rig: MotionRig, ws: Workspace, i: number, world: Quaternion): void {
  const p = rig.nodes[i]!.parent
  if (p < 0) ws.localQ[i]!.copy(world)
  else ws.localQ[i]!.copy(ws.worldQ[p]!).invert().multiply(world)
}

// ------------------------------------------------------------------------------ gait sampling

type GaitSampler = (name: string, t: number) => Float32Array | null

function gaitSampler(clip: AnimationClip | null): GaitSampler | null {
  if (!clip) return null
  const cache = new Map<string, Interpolant | null>()
  const byName = new Map<string, KeyframeTrack>()
  for (const t of clip.tracks) byName.set(t.name, t)
  return (name, t) => {
    let ip = cache.get(name)
    if (ip === undefined) {
      const track = byName.get(name)
      // (Quaternion tracks override this factory with a slerp interpolant.)
      ip = track ? track.InterpolantFactoryMethodLinear() : null
      cache.set(name, ip)
    }
    if (!ip) return null
    const d = clip.duration
    const tt = d > 0 ? ((t % d) + d) % d : 0
    return ip.evaluate(tt) as Float32Array
  }
}

// ------------------------------------------------------------------------------ compile

function channelsFor(rig: MotionRig, move: MotionScript) {
  const periodic = move.loops > 1
  const ts = move.keys.map((k) => k.t)
  const period = move.duration
  const make = (get: (k: MotionKey) => number) => new Channel(ts, move.keys.map(get), periodic, period)
  const joints = {} as Record<Joint, Channel[]>
  for (const j of JOINT_NAMES) {
    const arity = rig.stance[j].length
    joints[j] = Array.from({ length: arity }, (_, c) => make((k) => (k.pose[j] ?? rig.stance[j])[c] ?? 0))
  }
  // Body angles wrap: when periodic, the first key is reached again one whole turn further on.
  const last = move.keys[move.keys.length - 1]!.body
  const turns = (a: 'pitch' | 'roll' | 'yaw') => Math.round((last[a] - move.keys[0]!.body[a]) / 360) * 360
  const angle = (a: 'pitch' | 'roll' | 'yaw') => {
    if (!periodic) return make((k) => k.body[a])
    const vs = move.keys.map((k) => k.body[a])
    const off = turns(a)
    // Periodic wrap target = first value + whole turns: extend the key list with it.
    return new Channel([...ts, period], [...vs, vs[0]! + off], false, period)
  }
  return {
    joints,
    lift: make((k) => k.body.lift),
    pitch: angle('pitch'),
    roll: angle('roll'),
    yaw: angle('yaw'),
    face: {
      eyeL: make((k) => k.face.eyeL),
      eyeR: make((k) => k.face.eyeR),
      browL: make((k) => k.face.browL),
      browR: make((k) => k.face.browR),
    },
  }
}

const Rt = new Quaternion()
const Rh = new Quaternion()
const Rb = new Quaternion()
const S = new Quaternion()
const W = new Quaternion()
const bend = new Quaternion()
const v = new Vector3()
const up = new Vector3()

/** The body counts as upright while its up axis is within 45° of vertical. */
const UPRIGHT_COS = Math.cos(Math.PI / 4)
/** A low hand is lifted (arm swung up) in steps until it clears the floor by this much (m). */
const HAND_CLEARANCE = 0.02
const ARM_LIFT_STEP = 8
const MAX_ARM_LIFT = 96
const qFoot = new Quaternion()

export function compileMotion(rig: MotionRig, move: MotionScript): CompiledMotion {
  const ch = channelsFor(rig, move)
  const ws = workspace(rig)
  const loopSeconds = move.duration
  const n = Math.max(2, Math.ceil(loopSeconds * MOTION_FPS) + 1)
  const times = new Float32Array(n)
  for (let i = 0; i < n; i++) times[i] = Math.min(loopSeconds, i / MOTION_FPS)
  times[n - 1] = loopSeconds

  const gait =
    move.gait === 'walk' ? gaitSampler(rig.gait.walk) : move.gait === 'run' ? gaitSampler(rig.gait.run) : null
  const legsFromGait = gait !== null

  // Bones whose tracks the clip writes.
  const quatNodes = [rig.bone, rig.body, rig.head]
  for (const side of SIDES)
    quatNodes.push(
      rig.arms[side].upper,
      rig.arms[side].lower,
      rig.legs[side].upper,
      rig.legs[side].lower,
      rig.legs[side].foot,
    )
  const posNodes = [rig.bone, rig.body, rig.legs.L.foot, rig.legs.R.foot]
  const quatVals = new Map(quatNodes.map((i) => [i, new Float32Array(n * 4)]))
  const posVals = new Map(posNodes.map((i) => [i, new Float32Array(n * 3)]))
  const faceVals = FACE_TARGETS.map(() => new Float32Array(n))

  const order = rig.nodes.map((_, i) => i) // nodes are stored parents-first
  const unitsLift = 1 / rig.metresPerUnit
  const bonePos = new Vector3()
  const boneRestQ = rig.restQ[rig.bone]!
  const boneRestP = rig.restP[rig.bone]!

  for (let s = 0; s < n; s++) {
    const t = times[s]!
    const j = (name: Joint, c: number) => ch.joints[name][c]!.at(t)

    // ---- desired world rotations (upright frame: the root bone at rest)
    yawPitchRoll(j('torso', 2), j('torso', 0), j('torso', 1), Rt)
    yawPitchRoll(j('head', 1), j('head', 0), j('head', 2), Rh)
    /** Arm bone rotation; `extraRaise` lifts the arm (degrees) to keep a hand off the floor. */
    const orientArm = (side: Side, part: 'upper' | 'lower', extraRaise: number) => {
      const arm = rig.arms[side]
      const raise = Math.min(180, j(`shoulder${side}`, 0) + extraRaise)
      limbRotation(side, raise, j(`shoulder${side}`, 1), j(`shoulder${side}`, 2), S)
      if (part === 'upper') orient(rig, ws, arm.upper, W.copy(Rt).multiply(S).multiply(arm.upperNeutral))
      else {
        bend.setFromAxisAngle(arm.hinge, j(`elbow${side}`, 0) * DEG)
        orient(rig, ws, arm.lower, W.copy(Rt).multiply(S).multiply(bend).multiply(arm.lowerNeutral))
      }
    }

    // Reset locals to rest, then walk the hierarchy parents-first, overriding as we go.
    for (let i = 0; i < rig.nodes.length; i++) {
      ws.localQ[i]!.copy(rig.nodes[i]!.quat)
      ws.localP[i]!.copy(rig.nodes[i]!.pos)
    }
    if (gait) {
      const bp = gait('Body.position', t)
      const bq = gait('Body.quaternion', t)
      if (bp) ws.localP[rig.body]!.set(bp[0]!, bp[1]!, bp[2]!)
      if (bq) ws.localQ[rig.body]!.set(bq[0]!, bq[1]!, bq[2]!, bq[3]!)
    }

    for (const i of order) {
      if (i === rig.body) {
        // Body = torso: its rest (or gait) world rotation, turned by the torso angles.
        const rest = W.copy(ws.worldQ[rig.nodes[i]!.parent]!).multiply(ws.localQ[i]!)
        orient(rig, ws, i, rest.premultiply(Rt))
      } else if (i === rig.head) {
        orient(rig, ws, i, W.copy(Rt).multiply(Rh).multiply(rig.headNeutral))
      } else {
        for (const side of SIDES) {
          const arm = rig.arms[side]
          const leg = rig.legs[side]
          if (i === arm.upper || i === arm.lower) {
            orientArm(side, i === arm.upper ? 'upper' : 'lower', 0)
          } else if (!legsFromGait && (i === leg.upper || i === leg.lower)) {
            limbRotation(side, j(`hip${side}`, 0), j(`hip${side}`, 1), j(`hip${side}`, 2), S)
            if (i === leg.upper) orient(rig, ws, i, W.copy(S).multiply(leg.upperNeutral))
            else {
              bend.setFromAxisAngle(leg.hinge, j(`knee${side}`, 0) * DEG)
              orient(rig, ws, i, W.copy(S).multiply(bend).multiply(leg.lowerNeutral))
            }
          } else if (legsFromGait && (i === leg.upper || i === leg.lower)) {
            const q = gait!(`${rig.nodes[i]!.name}.quaternion`, t)
            if (q) ws.localQ[i]!.set(q[0]!, q[1]!, q[2]!, q[3]!)
          }
        }
      }
      if (i !== rig.legs.L.foot && i !== rig.legs.R.foot) place(rig, ws, i)
    }

    // ---- feet: re-attach to the shin ends (flat unless flexed), in the root bone's rest frame
    for (const side of SIDES) {
      const leg = rig.legs[side]
      const foot = leg.foot
      if (legsFromGait) {
        const fp = gait!(`${rig.nodes[foot]!.name}.position`, t)
        const fq = gait!(`${rig.nodes[foot]!.name}.quaternion`, t)
        if (fp) ws.localP[foot]!.set(fp[0]!, fp[1]!, fp[2]!)
        if (fq) ws.localQ[foot]!.set(fq[0]!, fq[1]!, fq[2]!, fq[3]!)
      } else {
        const yaw = j(`hip${side}`, 2) * SIDE_SIGN[side]
        tmpA.setFromAxisAngle(Y, yaw * DEG)
        tmpB.setFromAxisAngle(X, -j(`ankle${side}`, 0) * DEG)
        qFoot.copy(tmpA).multiply(tmpB).multiply(rig.restQ[foot]!)
        orient(rig, ws, foot, qFoot)
        const p = rig.nodes[foot]!.parent
        v.copy(ws.worldP[leg.end]!).sub(ws.worldP[p]!).applyQuaternion(W.copy(ws.worldQ[p]!).invert())
        ws.localP[foot]!.copy(v.divideScalar(ws.worldS[p]!))
      }
      place(rig, ws, foot)
      // children of the foot (the foot mesh) follow
      for (let i = foot + 1; i < rig.nodes.length; i++) {
        let a = rig.nodes[i]!.parent
        while (a > foot) a = rig.nodes[a]!.parent
        if (a === foot) place(rig, ws, i)
      }
    }

    // ---- whole-body rotation about the pivot, then put the lowest point at `lift`
    yawPitchRoll(ch.yaw.at(t), ch.pitch.at(t), ch.roll.at(t), Rb)
    /** Lowest point of the matching contacts after the whole-body rotation (model space). */
    const lowest = (match: (hand: Side | null) => boolean) => {
      let min = Infinity
      for (const c of rig.contacts) {
        if (!match(c.hand)) continue
        const q = ws.worldQ[c.node]!
        const p = ws.worldP[c.node]!
        const sc = ws.worldS[c.node]!
        for (const corner of c.corners) {
          v.copy(corner)
            .multiplyScalar(sc)
            .applyQuaternion(q)
            .add(p)
            .sub(rig.pivot)
            .applyQuaternion(Rb)
            .add(rig.pivot)
          if (v.y < min) min = v.y
        }
      }
      return min
    }
    // Upright, the feet/legs/body carry the robot and a low hand swings forward instead of holding it
    // up; tipped over (handstand, cartwheel, lying down), the hands count too.
    const upright = up.copy(Y).applyQuaternion(Rb).y >= UPRIGHT_COS
    const minY = lowest((hand) => !upright || hand === null)
    const lift = Math.max(0, ch.lift.at(t)) * unitsLift
    const dy = Number.isFinite(minY) ? lift - minY : 0
    if (upright) {
      const floor = HAND_CLEARANCE * unitsLift - dy
      for (const side of SIDES) {
        for (let extra = 0; extra < MAX_ARM_LIFT && lowest((hand) => hand === side) < floor;) {
          extra += ARM_LIFT_STEP
          orientArm(side, 'upper', extra)
          place(rig, ws, rig.arms[side].upper)
          orientArm(side, 'lower', extra)
          place(rig, ws, rig.arms[side].lower)
        }
      }
    }

    // Root bone: world = T(dy) · Pivot · Rb · Pivot⁻¹ · rest
    const boneQ = W.copy(Rb).multiply(boneRestQ)
    bonePos.copy(boneRestP).sub(rig.pivot).applyQuaternion(Rb).add(rig.pivot)
    bonePos.y += dy
    const arm = rig.armature
    const armInv = tmpA.copy(ws.worldQ[arm]!).invert()
    ws.localQ[rig.bone]!.copy(armInv).multiply(boneQ)
    ws.localP[rig.bone]!.copy(bonePos)
      .sub(ws.worldP[arm]!)
      .applyQuaternion(armInv)
      .divideScalar(ws.worldS[arm]!)

    // ---- record
    for (const [i, arr] of quatVals) {
      const q = ws.localQ[i]!
      arr[s * 4] = q.x
      arr[s * 4 + 1] = q.y
      arr[s * 4 + 2] = q.z
      arr[s * 4 + 3] = q.w
    }
    for (const [i, arr] of posVals) {
      const p = ws.localP[i]!
      arr[s * 3] = p.x
      arr[s * 3 + 1] = p.y
      arr[s * 3 + 2] = p.z
    }
    faceVals[0]![s] = ch.face.eyeL.at(t)
    faceVals[1]![s] = ch.face.eyeR.at(t)
    faceVals[2]![s] = ch.face.browL.at(t)
    faceVals[3]![s] = ch.face.browR.at(t)
  }

  // Quaternion sign continuity (slerp takes the short way between consecutive samples).
  for (const arr of quatVals.values()) {
    for (let s = 1; s < n; s++) {
      const dot =
        arr[s * 4]! * arr[(s - 1) * 4]! +
        arr[s * 4 + 1]! * arr[(s - 1) * 4 + 1]! +
        arr[s * 4 + 2]! * arr[(s - 1) * 4 + 2]! +
        arr[s * 4 + 3]! * arr[(s - 1) * 4 + 3]!
      if (dot < 0) for (let c = 0; c < 4; c++) arr[s * 4 + c] = -arr[s * 4 + c]!
    }
  }

  const tracks: KeyframeTrack[] = []
  for (const [i, arr] of quatVals)
    tracks.push(new QuaternionKeyframeTrack(`${rig.nodes[i]!.name}.quaternion`, times, arr))
  for (const [i, arr] of posVals)
    tracks.push(new VectorKeyframeTrack(`${rig.nodes[i]!.name}.position`, times, arr))
  if (rig.faceMesh) {
    FACE_TARGETS.forEach((name, k) => {
      tracks.push(
        new NumberKeyframeTrack(`${rig.faceMesh}.morphTargetInfluences[${name}]`, times, faceVals[k]!),
      )
    })
  }
  const clip = new AnimationClip(`custom:${move.name?.en ?? 'move'}`, loopSeconds, tracks)
  return { clip, loopSeconds }
}
