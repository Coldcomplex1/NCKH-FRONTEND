import { define } from './builtins'
import type { MotionScript } from './script'

/**
 * Hand-authored reference moves for the dev-only mock (VITE_MOTION_MOCK=true), the tests and tuning
 * the renderer. They are never shown to the model as examples, so the demo phrases really test
 * generation. Imported only by the dynamically loaded dev mock and by tests.
 */

const MOONWALK = define({
  name: { vi: 'Moonwalk', en: 'Moonwalk' },
  facing: 'right',
  loops: 4,
  duration: 1,
  travel: { forward: -0.35 },
  keys: [
    {
      t: 0,
      pose: {
        hipL: [4, 180],
        kneeL: [4],
        hipR: [25, 0],
        kneeR: [55],
        ankleR: [-45],
        shoulderL: [20, 160],
        shoulderR: [20, 20],
        torso: [6, 0, 0],
      },
    },
    {
      t: 0.5,
      pose: {
        hipR: [4, 180],
        kneeR: [4],
        hipL: [25, 0],
        kneeL: [55],
        ankleL: [-45],
        shoulderR: [20, 160],
        shoulderL: [20, 20],
        torso: [6, 0, 0],
      },
    },
  ],
})

const CROUCH = { hipL: [75, 0], hipR: [75, 0], kneeL: [100], kneeR: [100], torso: [25, 0, 0] }
const TUCK = {
  hipL: [115, 0],
  hipR: [115, 0],
  kneeL: [135],
  kneeR: [135],
  shoulderL: [110, 0],
  shoulderR: [110, 0],
  elbowL: [70],
  elbowR: [70],
}

const BACKFLIP = define({
  name: { vi: 'Lộn ngược ra sau', en: 'Backflip' },
  facing: 'right',
  duration: 1.8,
  keys: [
    { t: 0 },
    { t: 0.35, pose: { ...CROUCH, shoulderL: [45, 180], shoulderR: [45, 180], elbowL: [15], elbowR: [15] } },
    {
      t: 0.55,
      pose: { hipL: [10, 0], hipR: [10, 0], shoulderL: [170, 0], shoulderR: [170, 0] },
      body: { lift: 0.25, pitch: -40 },
    },
    { t: 0.85, pose: TUCK, body: { lift: 0.55, pitch: -180 } },
    {
      t: 1.1,
      pose: { hipL: [45, 0], hipR: [45, 0], kneeL: [60], kneeR: [60] },
      body: { lift: 0.3, pitch: -300 },
    },
    { t: 1.3, pose: { ...CROUCH, shoulderL: [80, 0], shoulderR: [80, 0] }, body: { pitch: -360 } },
    { t: 1.8 },
  ],
})

const SOMERSAULT = define({
  name: { vi: 'Lộn nhào', en: 'Somersault' },
  facing: 'right',
  duration: 2.2,
  travel: { forward: 0.7 },
  keys: [
    { t: 0 },
    {
      t: 0.4,
      pose: {
        ...CROUCH,
        torso: [45, 0, 0],
        shoulderL: [95, 0],
        shoulderR: [95, 0],
        elbowL: [10],
        elbowR: [10],
      },
    },
    { t: 0.75, pose: { ...TUCK, head: [40, 0, 0] }, body: { pitch: 90 } },
    { t: 1.05, pose: { ...TUCK, head: [40, 0, 0] }, body: { pitch: 180 } },
    { t: 1.35, pose: { ...TUCK, head: [30, 0, 0] }, body: { pitch: 280 } },
    { t: 1.7, pose: { ...CROUCH, shoulderL: [90, 0], shoulderR: [90, 0] }, body: { pitch: 360 } },
    { t: 2.2 },
  ],
})

const WINK = define({
  name: { vi: 'Nháy mắt', en: 'Wink' },
  duration: 2.2,
  keys: [
    { t: 0 },
    { t: 0.3, pose: { head: [0, -8, 12] }, face: { eyeL: 1, browR: 0.5 } },
    { t: 1.8, pose: { head: [0, -8, 12] }, face: { eyeL: 1, browR: 0.5 } },
    { t: 2.2 },
  ],
})

/** Dev-mock moves by keyword (accent-free, lower case). */
export const MOCK_MOVES: readonly { words: readonly string[]; move: MotionScript }[] = [
  { words: ['moonwalk', 'truot lui'], move: MOONWALK },
  { words: ['backflip', 'lon nguoc', 'nhao lon ra sau'], move: BACKFLIP },
  { words: ['lon nhao', 'nhao lon', 'somersault', 'lon vong'], move: SOMERSAULT },
  { words: ['mot mat', '1 mat', 'nhay mat', 'wink'], move: WINK },
]
