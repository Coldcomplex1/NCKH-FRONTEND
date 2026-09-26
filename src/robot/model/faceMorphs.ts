import { Float32BufferAttribute, Matrix4, Quaternion, Vector3, type Mesh, type Object3D } from 'three'

/**
 * RobotExpressive's face has only three morph targets (Angry, Surprised, Sad), each moving both
 * eyes together, and no eyelids. The eyes and brows are four separate vertex islands of the black
 * face primitive, so at load time we add per-side targets: EyeCloseL/R squash one eye to a slit
 * about its centre, BrowUpL/R lift one brow (a negative weight lowers it). "L" = the robot's left
 * (+X in model space).
 */

export const FACE_TARGETS = ['EyeCloseL', 'EyeCloseR', 'BrowUpL', 'BrowUpR'] as const
export type FaceTarget = (typeof FACE_TARGETS)[number]

/** Stable name for the face-features mesh, so animation tracks can bind to it. */
export const FACE_FEATURES_NAME = 'FaceFeatures'

/** An eye at weight 1 keeps this fraction of its height (a thin slit, still readable). */
const EYE_CLOSED_SCALE = 0.08
/** How far a brow moves at weight 1, as a fraction of the eye height. */
const BROW_TRAVEL = 0.28

interface Island {
  verts: number[]
  centroid: Vector3
}

/**
 * Connected components of a (flat-shaded, unwelded) mesh: vertices at the same position are one
 * vertex, triangles join their corners.
 */
function islands(mesh: Mesh): Island[] {
  const g = mesh.geometry
  const pos = g.attributes.position
  if (!pos) return []
  const n = pos.count
  const parent = new Int32Array(n)
  for (let i = 0; i < n; i++) parent[i] = i
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!
      x = parent[x]!
    }
    return x
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }
  // weld by position (quantised)
  const seen = new Map<string, number>()
  const q = (v: number) => Math.round(v * 1e6)
  for (let i = 0; i < n; i++) {
    const key = `${q(pos.getX(i))},${q(pos.getY(i))},${q(pos.getZ(i))}`
    const j = seen.get(key)
    if (j === undefined) seen.set(key, i)
    else union(i, j)
  }
  const idx = g.index
  const tri = idx ? idx.count : n
  for (let i = 0; i + 2 < tri; i += 3) {
    const a = idx ? idx.getX(i) : i
    const b = idx ? idx.getX(i + 1) : i + 1
    const c = idx ? idx.getX(i + 2) : i + 2
    union(a, b)
    union(b, c)
  }
  const groups = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const r = find(i)
    const list = groups.get(r)
    if (list) list.push(i)
    else groups.set(r, [i])
  }
  return [...groups.values()].map((verts) => {
    const c = new Vector3()
    for (const i of verts) c.add(new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)))
    return { verts, centroid: c.divideScalar(verts.length) }
  })
}

/** The face mesh whose morph targets actually move vertices (the black eyes/brows primitive). */
export function findFeatureMesh(faceMeshes: readonly Mesh[]): Mesh | null {
  let best: Mesh | null = null
  let bestDelta = 0
  for (const m of faceMeshes) {
    const targets = m.geometry.morphAttributes.position ?? []
    let sum = 0
    for (const t of targets)
      for (let i = 0; i < t.count; i++) sum += Math.abs(t.getY(i)) + Math.abs(t.getX(i))
    if (sum > bestDelta) {
      bestDelta = sum
      best = m
    }
  }
  return best
}

/**
 * Adds the per-side eye/brow morph targets to the feature mesh (idempotent). `root` is the model
 * root in its rest pose: its frame gives "up" and "left". Returns the mesh, or null when the face
 * does not look like RobotExpressive's (then the eye/brow controls simply do nothing).
 */
export function addFaceTargets(root: Object3D, faceMeshes: readonly Mesh[]): Mesh | null {
  const mesh = findFeatureMesh(faceMeshes)
  if (!mesh) return null
  const dict = mesh.morphTargetDictionary
  const infl = mesh.morphTargetInfluences
  const geo = mesh.geometry
  const targets = geo.morphAttributes.position
  if (!dict || !infl || !targets) return null
  if (dict.EyeCloseL !== undefined) return mesh

  // Model-space up (+Y) and left (+X) expressed in the mesh's local frame.
  root.updateMatrixWorld(true)
  const rootInv = new Matrix4().copy(root.matrixWorld).invert()
  const toModel = new Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld)
  const rot = new Quaternion()
  toModel.decompose(new Vector3(), rot, new Vector3())
  const inv = rot.clone().invert()
  const up = new Vector3(0, 1, 0).applyQuaternion(inv).normalize()
  const left = new Vector3(1, 0, 0).applyQuaternion(inv).normalize()

  const parts = islands(mesh)
  if (parts.length !== 4) return null
  // The two big islands are the eyes, the two small ones the brows; the side comes from "left".
  const bySize = [...parts].sort((a, b) => b.verts.length - a.verts.length)
  const eyes = bySize.slice(0, 2)
  const brows = bySize.slice(2)
  const side = (i: Island) => (i.centroid.dot(left) > 0 ? 'L' : 'R')
  const eye = { L: eyes.find((i) => side(i) === 'L'), R: eyes.find((i) => side(i) === 'R') }
  const brow = { L: brows.find((i) => side(i) === 'L'), R: brows.find((i) => side(i) === 'R') }
  if (!eye.L || !eye.R || !brow.L || !brow.R) return null

  const pos = geo.attributes.position!
  const v = new Vector3()
  const height = (i: Island) => {
    let lo = Infinity
    let hi = -Infinity
    for (const k of i.verts) {
      const h = v.fromBufferAttribute(pos, k).dot(up)
      lo = Math.min(lo, h)
      hi = Math.max(hi, h)
    }
    return hi - lo
  }
  const eyeHeight = (height(eye.L) + height(eye.R)) / 2

  const make = (name: FaceTarget, fill: (deltas: Float32Array) => void) => {
    const deltas = new Float32Array(pos.count * 3)
    fill(deltas)
    const attr = new Float32BufferAttribute(deltas, 3)
    attr.name = name
    targets.push(attr)
    // Keep other morph attribute arrays (normals) the same length.
    const normals = geo.morphAttributes.normal
    if (normals) {
      const z = new Float32BufferAttribute(new Float32Array(pos.count * 3), 3)
      z.name = name
      normals.push(z)
    }
    dict[name] = infl.length
    infl.push(0)
  }
  const squash = (i: Island) => (d: Float32Array) => {
    const c = i.centroid.dot(up)
    for (const k of i.verts) {
      const h = v.fromBufferAttribute(pos, k).dot(up) - c
      const off = -h * (1 - EYE_CLOSED_SCALE)
      d[k * 3] = up.x * off
      d[k * 3 + 1] = up.y * off
      d[k * 3 + 2] = up.z * off
    }
  }
  const lift = (i: Island) => (d: Float32Array) => {
    const off = eyeHeight * BROW_TRAVEL
    for (const k of i.verts) {
      d[k * 3] = up.x * off
      d[k * 3 + 1] = up.y * off
      d[k * 3 + 2] = up.z * off
    }
  }
  make('EyeCloseL', squash(eye.L))
  make('EyeCloseR', squash(eye.R))
  make('BrowUpL', lift(brow.L))
  make('BrowUpR', lift(brow.R))
  mesh.name = FACE_FEATURES_NAME
  return mesh
}
