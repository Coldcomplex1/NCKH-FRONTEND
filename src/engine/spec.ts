import type { ClipName, LoopClip, OnceClip, Vec2 } from './types'

/**
 * Robot + room constants shared by the engine (planning, estimates) and the 3D scene (src/robot).
 * three.js-free on purpose, so importing it never pulls three into the main chunk.
 *
 * Clip durations are VERIFIED from RobotExpressive.glb (three r186). Speeds/positions are tuned by eye.
 */

export const MODEL_URL = '/models/RobotExpressive.glb'

/** Seconds, from the GLB. */
export const CLIP_DURATION: Record<ClipName, number> = {
  Idle: 3.333,
  Walking: 0.958,
  Running: 0.958,
  Dance: 3.333,
  Sitting: 0.417,
  Standing: 0.417,
  Death: 0.958,
  Jump: 0.708,
  Yes: 1.667,
  No: 1.667,
  Wave: 1.833,
  Punch: 0.833,
  ThumbsUp: 1.583,
}

export const LOOP_CLIPS: readonly LoopClip[] = ['Idle', 'Walking', 'Running', 'Dance']
/** Clips that end in a held pose (the controller does not fade back to the base loop). */
export const HOLD_CLIPS: ReadonlySet<OnceClip> = new Set<OnceClip>(['Sitting', 'Death'])

/** Sitting/Standing are 0.42 s in the file: slow them down so the motion is gentle for elderly viewers. */
export const POSE_TIME_SCALE = 0.6

/** The model is 4.44 units tall with its feet at y = 0: 0.35 makes Ronaldo ≈ 1.55 m. */
export const ROBOT_SCALE = 0.35

/** Walkable rectangle (keeps the robot off the furniture and inside the camera's view). */
export const WALK_BOUNDS = { minX: -2.4, maxX: 2.4, minZ: -1.3, maxZ: 2.0 } as const

export const HOME: Vec2 = { x: 0, z: 0 }
/** "lại đây": the spot closest to the viewer. */
export const TO_USER: Vec2 = { x: 0, z: 1.6 }

/** Floor lamp (back-left) and standing fan (back-right). */
export const LAMP_POS: Vec2 = { x: -2.55, z: -2.05 }
export const FAN_POS: Vec2 = { x: 2.35, z: -1.95 }

/** One "bước" (step) of walking, metres. */
export const STEP_LENGTH = 0.45
/** Walk steps when the user gave no number (the parser's default): such walks go out and back. */
export const DEFAULT_WALK_STEPS = 3

/** Root speeds in m/s, matched to the clips' foot tracks at the given time scales. */
export const SPEED = { walk: 1.35, run: 2.2, back: 0.9 } as const
export const GAIT_TIME_SCALE = { walk: 1, run: 1, back: -0.7 } as const

/** Turning in place, rad/s (200°/s). */
export const TURN_SPEED = (200 * Math.PI) / 180
export const MIN_TURN_MS = 250
/** Turns larger than this play Walking at 0.6 as a foot shuffle. */
export const SHUFFLE_ABOVE = (30 * Math.PI) / 180
/** Info/chat answers turn to face the viewer when the robot is turned more than this. */
export const FACE_CAMERA_ABOVE = (20 * Math.PI) / 180
/** Milliseconds per 360° spin. */
export const SPIN_MS = { normal: 1100, reduced: 2000 } as const

export const DANCE_CYCLE_MS = 3333
/** Half-width of the running track (runs go back and forth along x). */
export const RUN_HALF_WIDTH = 2.0

/** How long each info card stays up (ms). The weather card stays while loading. */
export const CARD_TTL = {
  time: 12_000,
  date: 10_000,
  lunar: 10_000,
  weather: 15_000,
  math: 8_000,
  capabilities: 20_000,
  about: 15_000,
} as const

/** How long the timer pill shows "ringing" (counted from when the alarm is announced) before the timer goes. */
export const TIMER_RING_MS = 5_000

/** Max wait for the 3D robot (still loading) before the motion of a command runs without its body. */
export const READY_TIMEOUT_MS = 10_000
/** While waiting for the 3D robot, "Mình đang khởi động…" is shown only if the wait lasts this long. */
export const NOT_READY_NOTICE_MS = 1_000

/**
 * Without a body (2D fallback, or the model is not there yet) a 'hold' / 'move' step pauses this long
 * at most, so the 2D robot shows "dancing" / "walking" / lying down instead of flipping back at once,
 * without keeping it busy for a whole 60 s dance.
 */
export const NO_BODY_HOLD_MAX_MS = 3_000

/**
 * How long a reply that is NOT spoken (muted, no voice for the language) stays up before the next
 * one: long enough to read, 2.5 s + 55 ms per character, at most 8 s.
 */
export function readingMs(text: string): number {
  return Math.min(8_000, 2_500 + 55 * text.length)
}
