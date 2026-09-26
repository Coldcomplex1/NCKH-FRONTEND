/**
 * The motion-script contract: a short keyframed move that Qwen invents for a command the robot has
 * no built-in animation for ("moonwalk", "lộn nhào", "nhắm một mắt"…), and that the 3D robot compiles
 * onto its skeleton. Plain JSON, shared by the browser and the /api/motion function, so this file is
 * pure TypeScript with NO imports (the Vercel function bundles it; `@/` aliases do not work there).
 *
 * Conventions (the robot's own frame): "L" = the robot's own left; angles in degrees; lengths in
 * metres. A joint that a key does not list is in the NEUTRAL STANCE at that key (the robot's relaxed
 * idle pose); body angles that a key omits keep the previous key's value; lift, eyes and brows that a
 * key omits are 0.
 */

export const MOTION_VERSION = 1
/** Bump when the prompt or the contract changes meaning: cached moves from older versions are ignored. */
export const MOTION_PROMPT_VERSION = 1

export type Joint =
  | 'torso'
  | 'head'
  | 'shoulderL'
  | 'shoulderR'
  | 'elbowL'
  | 'elbowR'
  | 'hipL'
  | 'hipR'
  | 'kneeL'
  | 'kneeR'
  | 'ankleL'
  | 'ankleR'

export interface JointSpec {
  /** Component names, in order. */
  axes: readonly string[]
  min: readonly number[]
  max: readonly number[]
  /** Approximate neutral stance (the prompt shows it; the renderer measures the exact one). */
  neutral: readonly number[]
  /** One line for the prompt. */
  meaning: string
}

const TORSO: JointSpec = {
  axes: ['bend', 'side', 'twist'],
  min: [-30, -40, -60],
  max: [95, 40, 60],
  neutral: [0, 0, 0],
  meaning:
    'bend +forward/−backward at the waist; side + leans to the robot’s left; twist + turns the chest to the robot’s left',
}
const HEAD: JointSpec = {
  axes: ['pitch', 'yaw', 'roll'],
  min: [-40, -80, -40],
  max: [45, 80, 40],
  neutral: [0, 0, 0],
  meaning: 'pitch +looks down/−up; yaw + turns to the robot’s left; roll + tilts toward the left shoulder',
}
const SHOULDER: JointSpec = {
  axes: ['raise', 'dir', 'twist'],
  min: [0, -60, -90],
  max: [180, 180, 90],
  neutral: [27, 95, 0],
  meaning:
    'upper arm: raise 0 hangs down, 90 horizontal, 180 straight up; dir = where it points: 0 front, 90 out to the side, 180 behind, negative = across the body; twist rolls the arm (optional)',
}
const ELBOW: JointSpec = {
  axes: ['bend'],
  min: [0],
  max: [150],
  neutral: [57],
  meaning: '0 straight arm … 150 fully bent (forearm folds toward the front of the upper arm)',
}
const HIP: JointSpec = {
  axes: ['raise', 'dir', 'twist'],
  min: [0, -40, -45],
  max: [130, 180, 45],
  neutral: [22, 10, 0],
  meaning:
    'thigh: raise 0 hangs down, 90 horizontal; dir 0 front (kick), 90 out to the side, 180 behind; twist + turns the toes outward (optional)',
}
const KNEE: JointSpec = {
  axes: ['bend'],
  min: [0],
  max: [150],
  neutral: [41],
  meaning: '0 straight leg … 150 fully bent (shin folds backward)',
}
const ANKLE: JointSpec = {
  axes: ['flex'],
  min: [-70],
  max: [60],
  neutral: [0],
  meaning: 'foot tilt relative to the floor while upright: 0 flat, + toes up, − toes down (tiptoe ≈ −35)',
}

export const JOINTS: Record<Joint, JointSpec> = {
  torso: TORSO,
  head: HEAD,
  shoulderL: SHOULDER,
  shoulderR: SHOULDER,
  elbowL: ELBOW,
  elbowR: ELBOW,
  hipL: HIP,
  hipR: HIP,
  kneeL: KNEE,
  kneeR: KNEE,
  ankleL: ANKLE,
  ankleR: ANKLE,
}

export const JOINT_NAMES = Object.keys(JOINTS) as Joint[]

export type Facing = 'camera' | 'left' | 'right' | 'back'
export type Gait = 'none' | 'walk' | 'run'
export type Mood = 'angry' | 'surprised' | 'sad'
export const FACINGS: readonly Facing[] = ['camera', 'left', 'right', 'back']
export const GAITS: readonly Gait[] = ['none', 'walk', 'run']
export const MOODS: readonly Mood[] = ['angry', 'surprised', 'sad']

export interface MoveName {
  vi: string
  en: string
}

export interface BodyChannels {
  /** Height (m) of the lowest body point above the floor; 0 = touching the floor. */
  lift: number
  /** Whole-body rotation about hip height: + rolls forward (−360 = one backflip). */
  pitch: number
  /** + cartwheels toward the robot's left. */
  roll: number
  /** + spins toward the robot's left. */
  yaw: number
}

export interface FaceChannels {
  /** 0 open … 1 closed. */
  eyeL: number
  eyeR: number
  /** −1 frown … +1 raised. */
  browL: number
  browR: number
}

export interface MotionKey {
  /** Seconds from the start of the loop. */
  t: number
  /** Only the joints that differ from the neutral stance; arrays have the joint's full arity. */
  pose: Partial<Record<Joint, number[]>>
  body: BodyChannels
  face: FaceChannels
}

/** A validated, clamped move (the output of `normalizeMotion`). */
export interface MotionScript {
  v: typeof MOTION_VERSION
  name: MoveName | null
  /** Screen-relative direction the robot faces while performing (it turns first, then back). */
  facing: Facing
  /** A built-in gait loop that animates the legs (hip/knee/ankle keys are then ignored). */
  gait: Gait
  /** One expression for the whole move. */
  mood: Mood | null
  /** Repetitions of the keyed cycle. */
  loops: number
  /**
   * Seconds per loop, ≥ the last key's time. A single loop holds its last key until then; a
   * repeating one eases from the last key back into the first (at least LOOP_WRAP_SECONDS).
   */
  duration: number
  /** Floor travel per loop, metres, relative to the facing (forward, and to the robot's right). */
  travel: { forward: number; right: number }
  keys: MotionKey[]
}

export const MOTION_LIMITS = {
  minKeys: 2,
  maxKeys: 24,
  minLoopSeconds: 0.3,
  maxLoopSeconds: 8,
  maxLoops: 6,
  /** loops × duration. */
  maxTotalSeconds: 16,
  maxLift: 0.6,
  maxBodyAngle: 1080,
  maxTravelPerLoop: 1.5,
  maxNameChars: 30,
} as const

/** Minimum time between the last key and the end of a repeating loop (it eases back to the first key). */
export const LOOP_WRAP_SECONDS = 0.2

const NEUTRAL_BODY: BodyChannels = { lift: 0, pitch: 0, roll: 0, yaw: 0 }
const NEUTRAL_FACE: FaceChannels = { eyeL: 0, eyeR: 0, browL: 0, browR: 0 }

// ------------------------------------------------------------------------------------ helpers

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x)

function num(x: unknown): number | null {
  const n = typeof x === 'string' && x.trim() !== '' ? Number(x) : x
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
/** Round to 0.1 so cached/serialised moves stay small and stable. */
const r1 = (v: number) => {
  const r = Math.round(v * 10) / 10
  return Object.is(r, -0) ? 0 : r
}
const r3 = (v: number) => {
  const r = Math.round(v * 1000) / 1000
  return Object.is(r, -0) ? 0 : r
}

function pick<T extends string>(x: unknown, allowed: readonly T[], fallback: T): T {
  return typeof x === 'string' && (allowed as readonly string[]).includes(x.trim().toLowerCase())
    ? (x.trim().toLowerCase() as T)
    : fallback
}

const SAFE_NAME = /^[\p{L}\p{M}\p{N} ,.?!'-]+$/u

/**
 * A move name that may be shown and spoken: letters, digits, spaces and . , ? ! ' - only, at most
 * 30 characters. Anything else is dropped (the robot then says a generic line).
 */
export function cleanMoveName(x: unknown): MoveName | null {
  if (!isObj(x)) return null
  const one = (s: unknown): string | null => {
    if (typeof s !== 'string') return null
    const t = s.normalize('NFC').replace(/\s+/g, ' ').trim()
    if (t.length === 0 || t.length > MOTION_LIMITS.maxNameChars || !SAFE_NAME.test(t)) return null
    if (!/[\p{L}\p{N}]/u.test(t)) return null
    return t
  }
  const vi = one(x.vi)
  const en = one(x.en)
  if (!vi && !en) return null
  return { vi: vi ?? en!, en: en ?? vi! }
}

/** Seconds one performance of the move takes (all loops), before any time scaling. */
export function motionSeconds(m: Pick<MotionScript, 'loops' | 'duration'>): number {
  return m.loops * m.duration
}

// ---------------------------------------------------------------------------------- normalize

export type NormalizeResult =
  { ok: true; move: MotionScript; warnings: string[] } | { ok: false; errors: string[] }

function normalizePose(raw: unknown, where: string, warnings: string[]): Partial<Record<Joint, number[]>> {
  const pose: Partial<Record<Joint, number[]>> = {}
  if (raw === undefined || raw === null) return pose
  if (!isObj(raw)) {
    warnings.push(`${where}.pose: expected an object`)
    return pose
  }
  for (const [name, value] of Object.entries(raw)) {
    const spec = (JOINTS as Record<string, JointSpec | undefined>)[name]
    if (!spec) {
      warnings.push(`${where}.pose.${name}: unknown joint (ignored)`)
      continue
    }
    const arr = Array.isArray(value) ? value : [value]
    if (arr.length === 0 || arr.length > spec.axes.length) {
      warnings.push(`${where}.pose.${name}: expected ${spec.axes.length} number(s) [${spec.axes.join(', ')}]`)
      if (arr.length === 0) continue
    }
    const out: number[] = []
    for (let i = 0; i < spec.axes.length; i++) {
      // Missing trailing components (e.g. an omitted twist) default to 0.
      const n = i < arr.length ? num(arr[i]) : 0
      out.push(r1(clamp(n ?? 0, spec.min[i]!, spec.max[i]!)))
    }
    pose[name as Joint] = out
  }
  return pose
}

/**
 * Validate and clamp a move written by the model (or a cached/built-in one). Structural problems
 * are errors (the server sends them back to the model once, to repair); out-of-range values are
 * clamped silently; the body starts upright on the floor and ends upright (a multiple of 360°).
 */
export function normalizeMotion(raw: unknown): NormalizeResult {
  const errors: string[] = []
  const warnings: string[] = []
  if (!isObj(raw)) return { ok: false, errors: ['the move must be a JSON object'] }

  const rawKeys = raw.keys
  if (!Array.isArray(rawKeys)) errors.push('"keys" must be an array of keyframes')
  else if (rawKeys.length < MOTION_LIMITS.minKeys)
    errors.push(`"keys" needs at least ${MOTION_LIMITS.minKeys} keyframes`)
  if (errors.length > 0) return { ok: false, errors }

  // ---- keys: sort by time, drop exact duplicates (the later one wins), cap the count
  type Draft = { t: number; raw: Record<string, unknown>; index: number }
  const drafts: Draft[] = []
  ;(rawKeys as unknown[]).forEach((k, index) => {
    if (!isObj(k)) {
      errors.push(`keys[${index}] must be an object`)
      return
    }
    const t = num(k.t)
    if (t === null || t < 0) {
      errors.push(`keys[${index}].t must be a number of seconds ≥ 0`)
      return
    }
    drafts.push({ t: Math.min(t, MOTION_LIMITS.maxLoopSeconds), raw: k, index })
  })
  if (errors.length > 0) return { ok: false, errors }
  drafts.sort((a, b) => a.t - b.t || a.index - b.index)
  const unique: Draft[] = []
  for (const d of drafts) {
    const last = unique[unique.length - 1]
    if (last && Math.abs(last.t - d.t) < 1e-3) unique[unique.length - 1] = d
    else unique.push(d)
  }
  if (unique.length > MOTION_LIMITS.maxKeys) {
    warnings.push(`too many keyframes: kept the first ${MOTION_LIMITS.maxKeys}`)
    unique.length = MOTION_LIMITS.maxKeys
  }

  // ---- materialise every key (body angles hold, lift/face default to 0)
  const keys: MotionKey[] = []
  let prevAngles = { pitch: 0, roll: 0, yaw: 0 }
  unique.forEach((d, i) => {
    const where = `keys[${d.index}]`
    const pose = normalizePose(d.raw.pose, where, warnings)
    const b = isObj(d.raw.body) ? d.raw.body : {}
    const f = isObj(d.raw.face) ? d.raw.face : {}
    const ang = (v: unknown, prev: number) => {
      const n = num(v)
      return n === null ? prev : clamp(n, -MOTION_LIMITS.maxBodyAngle, MOTION_LIMITS.maxBodyAngle)
    }
    const body: BodyChannels = {
      lift: r3(clamp(num(b.lift) ?? 0, 0, MOTION_LIMITS.maxLift)),
      pitch: r1(ang(b.pitch, prevAngles.pitch)),
      roll: r1(ang(b.roll, prevAngles.roll)),
      yaw: r1(ang(b.yaw, prevAngles.yaw)),
    }
    const face: FaceChannels = {
      eyeL: r3(clamp(num(f.eyeL) ?? 0, 0, 1)),
      eyeR: r3(clamp(num(f.eyeR) ?? 0, 0, 1)),
      browL: r3(clamp(num(f.browL) ?? 0, -1, 1)),
      browR: r3(clamp(num(f.browR) ?? 0, -1, 1)),
    }
    if (i === 0) {
      // Start upright on the floor (the move blends in from the idle pose).
      body.pitch = body.roll = body.yaw = 0
      body.lift = 0
    }
    prevAngles = { pitch: body.pitch, roll: body.roll, yaw: body.yaw }
    keys.push({ t: r3(d.t), pose, body, face })
  })

  // The first key starts the loop at t = 0 (a later first key gets a neutral start).
  if (keys[0]!.t > 0) {
    keys.unshift({ t: 0, pose: {}, body: { ...NEUTRAL_BODY }, face: { ...NEUTRAL_FACE } })
    if (keys.length > MOTION_LIMITS.maxKeys) keys.length = MOTION_LIMITS.maxKeys
  }
  // End upright on the floor: the last body angles snap to the nearest whole turn.
  const last = keys[keys.length - 1]!
  last.body.lift = 0
  for (const a of ['pitch', 'roll', 'yaw'] as const) last.body[a] = r1(Math.round(last.body[a] / 360) * 360)

  // ---- header
  const lastT = last.t
  let duration = num(raw.duration) ?? lastT
  duration = Math.max(duration, lastT, MOTION_LIMITS.minLoopSeconds)
  duration = r3(Math.min(duration, MOTION_LIMITS.maxLoopSeconds))
  let loops = Math.round(num(raw.loops) ?? 1)
  loops = clamp(Number.isFinite(loops) ? loops : 1, 1, MOTION_LIMITS.maxLoops)
  // A repeating cycle needs a moment after its last key to ease back into its first one.
  if (loops > 1)
    duration = r3(Math.min(MOTION_LIMITS.maxLoopSeconds, Math.max(duration, lastT + LOOP_WRAP_SECONDS)))
  if (loops > 1 && duration - lastT < LOOP_WRAP_SECONDS - 1e-6) loops = 1 // no room to ease back
  while (loops > 1 && loops * duration > MOTION_LIMITS.maxTotalSeconds) loops--
  if (keys.length < MOTION_LIMITS.minKeys)
    return { ok: false, errors: ['"keys" needs at least 2 distinct times'] }

  const tr = isObj(raw.travel) ? raw.travel : {}
  const travel = {
    forward: r3(clamp(num(tr.forward) ?? 0, -MOTION_LIMITS.maxTravelPerLoop, MOTION_LIMITS.maxTravelPerLoop)),
    right: r3(clamp(num(tr.right) ?? 0, -MOTION_LIMITS.maxTravelPerLoop, MOTION_LIMITS.maxTravelPerLoop)),
  }
  const moodRaw = typeof raw.mood === 'string' ? raw.mood.trim().toLowerCase() : null
  const move: MotionScript = {
    v: MOTION_VERSION,
    name: cleanMoveName(raw.name),
    facing: pick(raw.facing, FACINGS, 'camera'),
    gait: pick(raw.gait, GAITS, 'none'),
    mood: moodRaw && (MOODS as readonly string[]).includes(moodRaw) ? (moodRaw as Mood) : null,
    loops,
    duration,
    travel,
    keys,
  }
  return { ok: true, move, warnings }
}
