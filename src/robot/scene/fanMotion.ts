import { dampFactor } from '../model/math'

/** Blade speed (rad/s) per fan speed; index 0 = off. */
export const FAN_OMEGA = [0, 12, 18, 26] as const
const SPIN_UP = 1.6
const SPIN_DOWN = 0.7

/** Next blade speed: eased toward the target, spinning down more slowly than up. */
export function stepFanOmega(omega: number, target: number, dt: number): number {
  const k = target > omega ? SPIN_UP : SPIN_DOWN
  const next = omega + (target - omega) * dampFactor(k, dt)
  return Math.abs(next - target) < 1e-3 ? target : next
}
