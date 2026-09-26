import { normalizeMotion, type MotionScript } from './script'

/**
 * The hand-authored thinking pose the robot holds while Qwen works. (Reference moves for the dev
 * mock and the tests live in referenceMoves.ts, so production bundles only carry this one.)
 */

export function define(raw: Record<string, unknown>): MotionScript {
  const r = normalizeMotion(raw)
  if (!r.ok) throw new Error(`built-in move is invalid: ${r.errors.join('; ')}`)
  return r.move
}

/**
 * Right hand on the chin, left arm across the chest, head tilted and a slow sway (played on a loop
 * until the answer arrives). Arm angles measured on the model: the hand really reaches the chin.
 */
export const THINKING: MotionScript = define({
  name: { vi: 'Suy nghĩ', en: 'Thinking' },
  loops: 2,
  duration: 3,
  keys: [
    {
      t: 0,
      pose: {
        shoulderR: [50, -60],
        elbowR: [80],
        shoulderL: [20, -60, -30],
        elbowL: [80],
        head: [-6, 12, 8],
      },
    },
    {
      t: 1.4,
      pose: {
        shoulderR: [50, -60],
        elbowR: [80],
        shoulderL: [20, -60, -30],
        elbowL: [80],
        head: [-12, 20, 14],
        torso: [0, 4, 0],
      },
      face: { browR: 0.6 },
    },
  ],
})
