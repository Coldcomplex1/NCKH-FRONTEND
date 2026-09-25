import { FAN_POS, LAMP_POS, ROBOT_SCALE } from '@/engine/spec'
import type { Vec2 } from '@/engine/types'
import { clamp } from '../model/math'
import { FAN_YAW } from './layout'

/**
 * Camera framing, pure math (no three.js) so it can be unit-tested.
 *
 * The camera looks at a target just above the robot's hips from slightly right of and above the
 * front. Its distance is the smallest one that keeps the robot, the lamp and the fan inside the
 * frame at the canvas aspect, so the same diorama reads on a wide desktop panel and a phone.
 */

export type V3 = readonly [number, number, number]

export const CAMERA_FOV = 42
export const CAMERA_NEAR = 0.1
export const CAMERA_FAR = 60

const len = (v: V3) => Math.hypot(v[0], v[1], v[2])
const norm = (v: V3): V3 => {
  const l = len(v) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

/** From the target toward the camera (unit). */
export const VIEW_DIR: V3 = norm([0.1, 0.3, 1])
/** Target height (the robot is ≈ 1.55 m tall, so this keeps it a little below centre, under the bubble). */
export const TARGET_Y = 0.92
/** How much the target follows the robot (x, z). */
export const FOLLOW = { x: 0.75, z: 0.5 } as const

export const DISTANCE_RANGE = { min: 4.2, max: 10 } as const

const ROBOT_H = 4.44 * ROBOT_SCALE

/** Fan cage radius; the outer edge may be cropped a little (the hub and most blades stay in view). */
const FAN_CAGE_R = 0.34
const FAN_OUTER_R = 0.25
const fanRim = (side: 1 | -1, r: number): V3 => [
  FAN_POS.x + side * r * Math.cos(FAN_YAW),
  1.12,
  FAN_POS.z - side * r * Math.sin(FAN_YAW),
]
/** How much of the lamp shade's outer (left) half may be cropped. */
const LAMP_OUTER_R = 0.22

/**
 * Points that must stay in frame at the home view (world metres). The lamp shade and the fan cage
 * may be cropped slightly at the panel edges: that keeps the robot large (≈ 40 % of the view height
 * on a square panel) while the lamp, its glow and the spinning blades still read clearly.
 */
export const KEY_POINTS: readonly V3[] = [
  // robot at home: head, feet, shoulders
  [0, ROBOT_H + 0.05, 0],
  [0, 0, 0.3],
  [-0.5, 0.9, 0],
  [0.5, 0.9, 0],
  // lamp: shade rims and base
  [LAMP_POS.x - LAMP_OUTER_R, 1.7, LAMP_POS.z],
  [LAMP_POS.x + 0.3, 1.7, LAMP_POS.z],
  [LAMP_POS.x, 0, LAMP_POS.z + 0.25],
  // fan: cage rims, top and base
  fanRim(1, FAN_OUTER_R),
  fanRim(-1, FAN_CAGE_R),
  [FAN_POS.x, 1.48, FAN_POS.z],
  [FAN_POS.x, 0, FAN_POS.z + 0.3],
]

export interface Ndc {
  x: number
  y: number
  /** Distance in front of the camera (> 0 = visible side). */
  depth: number
}

/** Project a world point for a camera at `target + dir·distance` looking at `target`. */
export function projectNdc(
  p: V3,
  target: V3,
  distance: number,
  aspect: number,
  fov: number = CAMERA_FOV,
  dir: V3 = VIEW_DIR,
): Ndc {
  const cam: V3 = [
    target[0] + dir[0] * distance,
    target[1] + dir[1] * distance,
    target[2] + dir[2] * distance,
  ]
  const f: V3 = [-dir[0], -dir[1], -dir[2]]
  const r = norm(cross(f, [0, 1, 0]))
  const u = cross(r, f)
  const rel = sub(p, cam)
  const depth = dot(rel, f)
  const t = Math.tan((fov * Math.PI) / 360)
  return { x: dot(rel, r) / (depth * t * aspect), y: dot(rel, u) / (depth * t), depth }
}

export interface CameraFit {
  distance: number
  /** Horizontal target offset that centres the lamp-to-fan span for this aspect. */
  biasX: number
}

export function homeTarget(biasX = 0): V3 {
  return [biasX, TARGET_Y, 0]
}

/** Target for a robot standing at `p` (partial follow keeps the room in view). */
export function followTarget(p: Vec2, biasX = 0): V3 {
  return [biasX + p.x * FOLLOW.x, TARGET_Y, p.z * FOLLOW.z]
}

const MARGIN = { x: 0.97, y: 0.9 } as const

function fits(distance: number, aspect: number, biasX: number): boolean {
  const target = homeTarget(biasX)
  return KEY_POINTS.every((p) => {
    const n = projectNdc(p, target, distance, aspect)
    return n.depth > CAMERA_NEAR && Math.abs(n.x) <= MARGIN.x && Math.abs(n.y) <= MARGIN.y
  })
}

/** Smallest distance (bisection) that fits every key point for this bias. */
function minDistance(aspect: number, biasX: number): number {
  let lo = 1.5
  let hi = 30
  if (fits(lo, aspect, biasX)) return lo
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid, aspect, biasX)) hi = mid
    else lo = mid
  }
  return hi
}

/**
 * Closest camera that keeps the robot, lamp and fan in frame, with the horizontal bias that allows
 * the closest one. Pure and cheap (called on resize only); clamped to DISTANCE_RANGE.
 */
export function fitCamera(aspect: number): CameraFit {
  const a = clamp(Number.isFinite(aspect) && aspect > 0 ? aspect : 1, 0.3, 4)
  let best: CameraFit = { distance: Infinity, biasX: 0 }
  for (let b = -0.6; b <= 0.6 + 1e-9; b += 0.04) {
    const d = minDistance(a, b)
    if (d < best.distance - 1e-6) best = { distance: d, biasX: Math.round(b * 100) / 100 }
  }
  return { distance: clamp(best.distance, DISTANCE_RANGE.min, DISTANCE_RANGE.max), biasX: best.biasX }
}

export function fitDistance(aspect: number): number {
  return fitCamera(aspect).distance
}

/** Fraction of the view height the robot (≈ 1.55 m) takes at `distance`. */
export function robotViewFraction(distance: number): number {
  return ROBOT_H / (2 * distance * Math.tan((CAMERA_FOV * Math.PI) / 360))
}
