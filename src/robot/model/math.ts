/** Small pure helpers shared by the controller and the scene (no three.js). */

const TAU = Math.PI * 2

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function easeInOutCubic(t: number): number {
  const k = clamp(t, 0, 1)
  return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2
}

/** Wrap an angle to (−π, π]. */
export function normalizeAngle(a: number): number {
  let r = a % TAU
  if (r <= -Math.PI) r += TAU
  else if (r > Math.PI) r -= TAU
  return r
}

export function shortestDelta(from: number, to: number): number {
  return normalizeAngle(to - from)
}

/** Frame-rate independent exponential smoothing factor for rate λ (1/s). */
export function dampFactor(lambda: number, dt: number): number {
  return 1 - Math.exp(-lambda * dt)
}

export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * dampFactor(lambda, dt)
}

/**
 * Distance travelled along a straight move with a trapezoid speed profile: eased ramps of `ramp`
 * seconds at both ends and a constant cruise speed in between, so the legs (a looping Walking
 * clip) match the ground speed for most of the move. Returns the 0–1 progress at time `t`.
 */
export function trapezoidProgress(t: number, total: number, ramp: number): number {
  if (total <= 0) return 1
  const a = Math.min(ramp, total / 2)
  const tt = clamp(t, 0, total)
  // Speed: rises linearly over [0,a], cruise v, falls over [total−a,total]. Area = v·(total − a).
  const v = 1 / (total - a)
  if (tt < a) return (v * tt * tt) / (2 * a)
  if (tt > total - a) {
    const r = total - tt
    return 1 - (v * r * r) / (2 * a)
  }
  return v * (tt - a / 2)
}
