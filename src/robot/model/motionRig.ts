import { Quaternion, Vector3, type AnimationClip, type Mesh, type Object3D, type SkinnedMesh } from 'three'
import type { Joint } from '@/motion/script'

/**
 * Everything the motion compiler needs to know about RobotExpressive, captured ONCE from the rest
 * (bind) pose at load time: the node hierarchy with rest transforms (for a tiny quaternion FK that
 * never touches the live scene), the neutral "hanging" orientations of the limbs, the measured idle
 * stance, and contact boxes for floor contact. All in model space (the glTF scene's own frame,
 * native units: +X = the robot's left, +Y up, +Z = the way it faces).
 */

export type Side = 'L' | 'R'
export const SIDES: readonly Side[] = ['L', 'R']
/** +1 for the robot's left (+X), −1 for its right. */
export const SIDE_SIGN: Record<Side, 1 | -1> = { L: 1, R: -1 }

export interface RigNode {
  name: string
  /** Index of the parent in `nodes`, −1 for a child of the model root. */
  parent: number
  pos: Vector3
  quat: Quaternion
  /** Uniform scale. */
  scale: number
}

export interface Limb {
  upper: number
  lower: number
  /** Rest-pose world orientation of the upper bone swung to hang straight down. */
  upperNeutral: Quaternion
  /** Lower-bone orientation that, with the hinge angle, reproduces the rest pose. */
  lowerNeutral: Quaternion
  /** Hinge axis of the middle joint in the neutral (hanging) frame. */
  hinge: Vector3
}

export interface MotionRig {
  nodes: RigNode[]
  index: ReadonlyMap<string, number>
  /** Rest world transforms (model space). */
  restQ: Quaternion[]
  restP: Vector3[]
  restS: number[]
  bone: number
  armature: number
  body: number
  neck: number
  head: number
  arms: Record<Side, Limb>
  legs: Record<Side, Limb & { end: number; foot: number }>
  /** Neutral head orientation (idle, looking straight ahead) in model space. */
  headNeutral: Quaternion
  /** The measured idle stance: the value an unlisted joint takes. */
  stance: Record<Joint, number[]>
  /**
   * Points (in their node's local frame) that can touch the floor. `hand` marks the (skinned)
   * hands: they only hold the robot up when its body is tipped over (handstand, cartwheel…).
   */
  contacts: { node: number; corners: Vector3[]; hand: Side | null }[]
  /** Pivot of whole-body rotations (about hip height). */
  pivot: Vector3
  /** Metres per model unit. */
  metresPerUnit: number
  /** Name of the mesh carrying the EyeClose/BrowUp targets (null: no face controls). */
  faceMesh: string | null
  gait: { walk: AnimationClip | null; run: AnimationClip | null }
}

const DOWN = new Vector3(0, -1, 0)
const RAD = 180 / Math.PI

/** Minimal rotation taking unit vector `from` to unit vector `to`. */
function swingBetween(from: Vector3, to: Vector3): Quaternion {
  return new Quaternion().setFromUnitVectors(from, to)
}

/** The 26 axis/edge/corner directions of a cube. */
const HULL_DIRS: Vector3[] = []
for (const x of [-1, 0, 1])
  for (const y of [-1, 0, 1])
    for (const z of [-1, 0, 1]) if (x || y || z) HULL_DIRS.push(new Vector3(x, y, z).normalize())

/** The points that are extreme along one of the 26 directions (deduplicated). */
function extremes(points: readonly Vector3[]): Vector3[] {
  const best = new Set<Vector3>()
  for (const d of HULL_DIRS) {
    let arg: Vector3 | null = null
    let max = -Infinity
    for (const p of points) {
      const s = p.dot(d)
      if (s > max) {
        max = s
        arg = p
      }
    }
    if (arg) best.add(arg)
  }
  return [...best].map((p) => p.clone())
}

/** (raise, dir) of a limb direction, as the motion contract defines them. */
function limbAngles(d: Vector3, side: Side): [number, number] {
  const raise = Math.acos(Math.max(-1, Math.min(1, -d.y))) * RAD
  const out = d.x * SIDE_SIGN[side]
  const dir = Math.hypot(out, d.z) < 1e-6 ? 0 : Math.atan2(out, d.z) * RAD
  return [Math.round(raise * 10) / 10, Math.round(dir * 10) / 10]
}

export interface RigSource {
  /** The model root, in its rest pose (before any mixer has run). */
  scene: Object3D
  idle: AnimationClip | null
  walk: AnimationClip | null
  run: AnimationClip | null
  faceMesh: Mesh | null
  metresPerUnit: number
}

/**
 * Capture the rig. Returns null when the model is not shaped like RobotExpressive (then custom moves
 * are skipped and the robot keeps its built-in clips only).
 */
export function captureMotionRig(src: RigSource): MotionRig | null {
  const { scene } = src
  const nodes: RigNode[] = []
  const index = new Map<string, number>()
  const objs: Object3D[] = []
  const visit = (o: Object3D, parent: number) => {
    const s = o.scale
    if (Math.abs(s.x - s.y) > 1e-4 * Math.abs(s.x) || Math.abs(s.x - s.z) > 1e-4 * Math.abs(s.x)) return false
    const i = nodes.length
    nodes.push({ name: o.name, parent, pos: o.position.clone(), quat: o.quaternion.clone(), scale: s.x })
    objs.push(o)
    if (o.name && !index.has(o.name)) index.set(o.name, i)
    for (const c of o.children) if (visit(c, i) === false) return false
    return true
  }
  for (const c of scene.children) if (!visit(c, -1)) return null

  const need = (name: string) => index.get(name)
  const names = [
    'RobotArmature',
    'Bone',
    'Body',
    'Neck',
    'Head',
    'UpperArmL',
    'LowerArmL',
    'Palm2L',
    'UpperArmR',
    'LowerArmR',
    'Palm2R',
    'UpperLegL',
    'LowerLegL',
    'LowerLegL_end',
    'FootL',
    'UpperLegR',
    'LowerLegR',
    'LowerLegR_end',
    'FootR',
  ]
  if (names.some((n) => need(n) === undefined)) return null
  const at = (n: string) => need(n)!

  // Rest world transforms (model space).
  const restQ: Quaternion[] = []
  const restP: Vector3[] = []
  const restS: number[] = []
  nodes.forEach((n, i) => {
    if (n.parent < 0) {
      restQ[i] = n.quat.clone()
      restP[i] = n.pos.clone()
      restS[i] = n.scale
    } else {
      const pq = restQ[n.parent]!
      restQ[i] = pq.clone().multiply(n.quat)
      restP[i] = n.pos.clone().multiplyScalar(restS[n.parent]!).applyQuaternion(pq).add(restP[n.parent]!)
      restS[i] = restS[n.parent]! * n.scale
    }
  })

  const dir = (a: number, b: number) => restP[b]!.clone().sub(restP[a]!).normalize()
  const limb = (upper: number, lower: number, tip: number): Limb => {
    const upperDir = dir(upper, lower)
    const lowerDir = dir(lower, tip)
    const unswing = swingBetween(upperDir, DOWN)
    const upperNeutral = unswing.clone().multiply(restQ[upper]!)
    const angle = upperDir.angleTo(lowerDir)
    const hingeRest = new Vector3().crossVectors(upperDir, lowerDir)
    // A (nearly) straight rest limb: any axis perpendicular to it; the model's elbows/knees are bent.
    if (hingeRest.lengthSq() < 1e-10) hingeRest.set(1, 0, 0)
    hingeRest.normalize()
    const bendRest = new Quaternion().setFromAxisAngle(hingeRest, angle)
    const lowerNeutral = unswing.clone().multiply(bendRest.clone().invert()).multiply(restQ[lower]!)
    const hinge = hingeRest.clone().applyQuaternion(unswing).normalize()
    return { upper, lower, upperNeutral, lowerNeutral, hinge }
  }

  const arms = {
    L: limb(at('UpperArmL'), at('LowerArmL'), at('Palm2L')),
    R: limb(at('UpperArmR'), at('LowerArmR'), at('Palm2R')),
  }
  const legs = {
    L: {
      ...limb(at('UpperLegL'), at('LowerLegL'), at('LowerLegL_end')),
      end: at('LowerLegL_end'),
      foot: at('FootL'),
    },
    R: {
      ...limb(at('UpperLegR'), at('LowerLegR'), at('LowerLegR_end')),
      end: at('LowerLegR_end'),
      foot: at('FootR'),
    },
  }

  // Measured idle stance (what an unlisted joint does).
  const stance = {} as Record<Joint, number[]>
  stance.torso = [0, 0, 0]
  stance.head = [0, 0, 0]
  for (const side of SIDES) {
    const a = arms[side]
    const l = legs[side]
    stance[`shoulder${side}`] = [...limbAngles(dir(a.upper, a.lower), side), 0]
    stance[`elbow${side}`] = [
      Math.round(dir(a.upper, a.lower).angleTo(dir(a.lower, at(`Palm2${side}`))) * RAD * 10) / 10,
    ]
    stance[`hip${side}`] = [...limbAngles(dir(l.upper, l.lower), side), 0]
    stance[`knee${side}`] = [Math.round(dir(l.upper, l.lower).angleTo(dir(l.lower, l.end)) * RAD * 10) / 10]
    stance[`ankle${side}`] = [0]
  }

  // Neutral head: the idle clip's first head frame (the rest pose has the head turned a little).
  const head = at('Head')
  const neck = at('Neck')
  let headLocal = nodes[head]!.quat.clone()
  const track = src.idle?.tracks.find((t) => t.name === 'Head.quaternion')
  if (track && track.values.length >= 4) {
    headLocal = new Quaternion(track.values[0], track.values[1], track.values[2], track.values[3]).normalize()
  }
  const headNeutral = restQ[neck]!.clone().multiply(headLocal)

  // Contact points: the extreme vertices of every mesh along 26 directions (a tight hull, so a
  // rotated body really touches the floor). Rigid meshes ride their own node; the skinned hands
  // ride their forearm (their fingers never move in custom moves).
  scene.updateMatrixWorld(true)
  const sceneInv = scene.matrixWorld.clone().invert()
  const contacts: MotionRig['contacts'] = []
  objs.forEach((o, i) => {
    const mesh = o as Mesh & { isSkinnedMesh?: boolean }
    if (!(mesh as Mesh).isMesh) return
    const pos = mesh.geometry.attributes.position
    if (!pos) return
    const pts: Vector3[] = []
    for (let k = 0; k < pos.count; k++) pts.push(new Vector3().fromBufferAttribute(pos, k))
    if (!mesh.isSkinnedMesh) {
      contacts.push({ node: i, corners: extremes(pts), hand: null })
      return
    }
    // Skinned hand at rest: its SKINNED vertices (the raw geometry is stored in another pose), in
    // model space, then in the forearm's local frame.
    const skinned = mesh as unknown as SkinnedMesh
    const toModel = sceneInv.clone().multiply(mesh.matrixWorld)
    const model = pts.map((p, k) => skinned.applyBoneTransform(k, p).applyMatrix4(toModel))
    const cx = model.reduce((acc, p) => acc + p.x, 0) / Math.max(1, model.length)
    const side: Side = cx >= 0 ? 'L' : 'R'
    const arm = arms[side].lower
    const q = restQ[arm]!.clone().invert()
    const local = model.map((p) => p.sub(restP[arm]!).applyQuaternion(q).divideScalar(restS[arm]!))
    contacts.push({ node: arm, corners: extremes(local), hand: side })
  })

  const body = at('Body')
  const pivot = restP[body]!.clone()
  pivot.y += 0.15 / src.metresPerUnit

  return {
    nodes,
    index,
    restQ,
    restP,
    restS,
    bone: at('Bone'),
    armature: at('RobotArmature'),
    body,
    neck,
    head,
    arms,
    legs,
    headNeutral,
    stance,
    contacts,
    pivot,
    metresPerUnit: src.metresPerUnit,
    faceMesh: src.faceMesh?.name || null,
    gait: { walk: src.walk, run: src.run },
  }
}
