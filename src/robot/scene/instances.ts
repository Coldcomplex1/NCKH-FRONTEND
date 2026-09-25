import { Euler, Quaternion, Vector3, type EulerOrder, type Matrix4 } from 'three'

/** Static instance transforms (pure three math, unit-tested without WebGL). */

export type Triple = readonly [number, number, number]

export interface InstanceSpec {
  position: Triple
  rotation?: Triple
  /** Euler order of `rotation` (default 'XYZ'); 'YXZ' = yaw then tilt, like a nested group. */
  order?: EulerOrder
  scale?: Triple | number
  /** Per-instance colour (multiplies the material colour, so keep that white). */
  color?: string
}

const p = new Vector3()
const q = new Quaternion()
const s = new Vector3()
const e = new Euler()

/** The instance matrix for one spec (written into `out`). */
export function composeInstance(it: InstanceSpec, out: Matrix4): Matrix4 {
  p.set(...it.position)
  const r = it.rotation ?? ([0, 0, 0] as const)
  q.setFromEuler(e.set(r[0], r[1], r[2], it.order ?? 'XYZ'))
  if (typeof it.scale === 'number') s.setScalar(it.scale)
  else s.set(...(it.scale ?? ([1, 1, 1] as const)))
  return out.compose(p, q, s)
}
