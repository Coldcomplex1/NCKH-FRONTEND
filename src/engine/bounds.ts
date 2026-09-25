import { WALK_BOUNDS } from './spec'
import type { Vec2 } from './types'

/**
 * Floor geometry helpers. Conventions: yaw 0 faces the camera (+Z); a positive yaw turns toward +X
 * (screen-right), so the facing vector is (sin yaw, cos yaw). "Left"/"right" are SCREEN-relative.
 */

const TAU = Math.PI * 2

/** Wrap an angle to (−π, π]. */
export function normalizeAngle(a: number): number {
  let r = a % TAU
  if (r <= -Math.PI) r += TAU
  else if (r > Math.PI) r -= TAU
  return r
}

/** Signed shortest rotation from `from` to `to`, in (−π, π]. */
export function shortestDelta(from: number, to: number): number {
  return normalizeAngle(to - from)
}

export function facing(yaw: number): Vec2 {
  return { x: Math.sin(yaw), z: Math.cos(yaw) }
}

/** Yaw that looks from `from` toward `to`. */
export function yawTowards(from: Vec2, to: Vec2): number {
  return Math.atan2(to.x - from.x, to.z - from.z)
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.z - a.z)
}

/** Yaw for screen-left / screen-right (−X / +X). */
export const YAW_SCREEN_LEFT = -Math.PI / 2
export const YAW_SCREEN_RIGHT = Math.PI / 2
export const YAW_CAMERA = 0

export type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number }

export function clampPoint(p: Vec2, b: Bounds = WALK_BOUNDS): Vec2 {
  return { x: Math.min(b.maxX, Math.max(b.minX, p.x)), z: Math.min(b.maxZ, Math.max(b.minZ, p.z)) }
}

/**
 * How far one can travel from `from` along `dir` (unit vector) before leaving the bounds, capped at
 * `dist`. A start point outside the bounds is first clamped inside.
 */
export function travel(from: Vec2, dir: Vec2, dist: number, b: Bounds = WALK_BOUNDS): number {
  const p = clampPoint(from, b)
  let t = dist
  const EPS = 1e-9
  if (dir.x > EPS) t = Math.min(t, (b.maxX - p.x) / dir.x)
  else if (dir.x < -EPS) t = Math.min(t, (b.minX - p.x) / dir.x)
  if (dir.z > EPS) t = Math.min(t, (b.maxZ - p.z) / dir.z)
  else if (dir.z < -EPS) t = Math.min(t, (b.minZ - p.z) / dir.z)
  return Math.max(0, t)
}

export interface MoveResult {
  to: Vec2
  /** Distance actually travelled. */
  dist: number
  /** The room's edge removed more than 30% of the requested distance. */
  blocked: boolean
  /** Nothing (or almost nothing) could be travelled. */
  fullyBlocked: boolean
}

/** Move up to `dist` metres from `from` along `yaw`, stopping at the edge of the walkable area. */
export function moveAlong(from: Vec2, yaw: number, dist: number, b: Bounds = WALK_BOUNDS): MoveResult {
  const dir = facing(yaw)
  const start = clampPoint(from, b)
  const t = travel(start, dir, dist, b)
  const to = { x: round(start.x + dir.x * t), z: round(start.z + dir.z * t) }
  return { to, dist: t, blocked: t < dist * 0.7, fullyBlocked: t < 0.05 }
}

/** Round to millimetres so plans are stable in tests and snapshots. */
export function round(n: number): number {
  const r = Math.round(n * 1000) / 1000
  return Object.is(r, -0) ? 0 : r
}
