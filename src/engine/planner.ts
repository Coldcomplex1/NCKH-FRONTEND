import { actionCategory, LIMITS, MOTION_TYPES, type Action, type ActionOf } from '@/core/actions'
import type { Note, Suggestion } from '@/core/parser'
import { DEFAULT_PLACE } from '@/core/places'
import { reply, type CapInfo, type ReplyRef } from '@/core/replies'
import type { Posture } from '@/core/robot'
import type { FanSpeed, RoomState } from '@/core/room'
import {
  distance,
  moveAlong,
  normalizeAngle,
  round,
  shortestDelta,
  YAW_CAMERA,
  YAW_SCREEN_LEFT,
  YAW_SCREEN_RIGHT,
  yawTowards,
  clampPoint,
} from './bounds'
import {
  CARD_TTL,
  CLIP_DURATION,
  DANCE_CYCLE_MS,
  DEFAULT_WALK_STEPS,
  FACE_CAMERA_ABOVE,
  FAN_POS,
  GAIT_TIME_SCALE,
  HOME,
  LAMP_POS,
  MIN_TURN_MS,
  POSE_TIME_SCALE,
  RUN_HALF_WIDTH,
  SHUFFLE_ABOVE,
  SPEED,
  SPIN_MS,
  STEP_LENGTH,
  TO_USER,
  TURN_SPEED,
} from './spec'
import type { EmoteClip, Plan, PlannerSnapshot, Pose, Step, Vec2 } from './types'

/**
 * The planner: a PURE function from parsed actions + a world snapshot to a list of serializable
 * steps. It simulates posture, position and room state as it goes, so chains ("ngồi xuống rồi nhảy",
 * "bật đèn rồi tắt đèn") and no-ops ("đèn đang bật sẵn rồi") come out right.
 *
 * Reply policy:
 * - a run of consecutive motion actions gets ONE non-blocking acknowledgement at its start
 *   (the action's own key, or 'motion.chain' for several);
 * - info/chat answers are blocking (the plan waits for the speech), so answers never overlap;
 * - home replies are non-blocking and land when the lamp/fan actually changes (mid-nod).
 */

export interface PlanRequest {
  actions: Action[]
  notes: Note[]
  hasUnknown: boolean
  suggestions: Suggestion[]
  /** The request had more than LIMITS.maxActions actions before splitForBody() cut it (say so). */
  tooMany?: boolean
}

type MotionType = (typeof MOTION_TYPES)[number]
type MotionAction = Extract<Action, { type: MotionType }>

const isMotion = (a: Action): a is MotionAction => actionCategory(a.type) === 'motion'

const GESTURE_CLIP: Record<'jump' | 'wave' | 'nod' | 'shake_head' | 'thumbs_up', EmoteClip> = {
  jump: 'Jump',
  wave: 'Wave',
  nod: 'Yes',
  shake_head: 'No',
  thumbs_up: 'ThumbsUp',
}

function clampInt(n: number, min: number, max: number): number {
  const v = Number.isFinite(n) ? Math.round(n) : min
  return Math.min(max, Math.max(min, v))
}

function clampNum(n: number, min: number, max: number): number {
  const v = Number.isFinite(n) ? n : min
  return Math.min(max, Math.max(min, v))
}

class Builder {
  private stack: Step[][] = [[]]
  posture: Posture
  pose: Pose
  room: RoomState
  jokesUsed = 0
  /** Every limit actually applied while planning, one per action type (for 'note.capped'). */
  readonly caps: CapInfo[] = []

  readonly snap: PlannerSnapshot

  constructor(snap: PlannerSnapshot) {
    this.snap = snap
    this.posture = snap.posture
    this.pose = { ...snap.pose }
    this.room = { light: { ...snap.room.light }, fan: { ...snap.room.fan } }
  }

  get steps(): Step[] {
    return this.stack[0] ?? []
  }

  get iso(): string {
    return this.snap.now.toISOString()
  }

  get reduced(): boolean {
    return this.snap.reducedMotion
  }

  get projectWer(): number | undefined {
    return this.snap.projectWer
  }

  /** The next joke in the rotation. */
  nextJoke(): number {
    return this.snap.jokeIndex + this.jokesUsed++
  }

  get countCap(): number {
    return this.reduced ? LIMITS.maxCountReducedMotion : LIMITS.maxCount
  }

  emit(...steps: Step[]): void {
    this.stack[this.stack.length - 1]!.push(...steps)
  }

  /** Run `fn` and return the steps it emitted instead of emitting them. */
  capture(fn: () => void): Step[] {
    this.stack.push([])
    fn()
    return this.stack.pop() ?? []
  }

  say(ref: ReplyRef, wait: boolean, extra?: { assertive?: boolean; silent?: boolean }): void {
    this.emit({ op: 'say', reply: ref, wait, ...extra })
  }

  robot(patch: Extract<Step, { op: 'robot' }>['patch']): void {
    this.emit({ op: 'robot', patch })
  }

  /** Clamp a count to `cap`, recording the cap (with its action and unit) when it bites. */
  capCount(n: number, cap: number, what: Omit<CapInfo, 'max'>): number {
    const v = clampInt(n, 1, Number.MAX_SAFE_INTEGER)
    if (v > cap) this.noteCap({ ...what, max: cap })
    return Math.min(v, cap)
  }

  noteCap(c: CapInfo): void {
    const same = this.caps.find((x) => x.action === c.action && x.unit === c.unit)
    if (!same) this.caps.push(c)
    else same.max = Math.min(same.max, c.max)
  }

  get standing(): boolean {
    return this.posture === 'standing'
  }

  // ---- body helpers

  /** Turn to an absolute yaw. `shuffle` plays Walking at 0.6 under large turns (standing only). */
  turnTo(yaw: number, opts: { shuffle?: boolean; fast?: boolean } = {}): void {
    const delta = shortestDelta(this.pose.yaw, yaw)
    if (Math.abs(delta) < 0.01) return
    const speed = opts.fast ? TURN_SPEED * 2 : TURN_SPEED
    const ms = Math.round(Math.max(MIN_TURN_MS, (Math.abs(delta) / speed) * 1000))
    const target = round(normalizeAngle(yaw))
    const shuffle = opts.shuffle && this.standing && Math.abs(delta) > SHUFFLE_ABOVE
    if (shuffle) this.emit({ op: 'base', clip: 'Walking', timeScale: 0.6, fade: 0.2 })
    this.emit({ op: 'turn', yaw: target, ms })
    if (shuffle) this.emit({ op: 'base', clip: 'Idle', fade: 0.25 })
    this.pose.yaw = target
  }

  /** Answers face the viewer. A seated (or sleeping) robot answers as it is: no body swivel on the floor. */
  faceCamera(): void {
    if (!this.standing) return
    if (Math.abs(normalizeAngle(this.pose.yaw - YAW_CAMERA)) > FACE_CAMERA_ABOVE) {
      this.turnTo(YAW_CAMERA, { shuffle: true })
    }
  }

  moveTo(to: Vec2, speed: number): void {
    const target = { x: round(to.x), z: round(to.z) }
    const ms = Math.round((distance(this.pose, target) / Math.max(0.05, speed)) * 1000)
    this.emit({ op: 'move', to: target, speed, ms })
    this.pose.x = target.x
    this.pose.z = target.z
  }

  /** Posture prelude: get up from whatever posture, so a full-body clip can play. */
  ensureStanding(): void {
    switch (this.posture) {
      case 'standing':
        return
      case 'sleeping':
        this.wakeFace()
        this.standUp()
        return
      case 'sitting':
        this.standUp()
        return
      case 'lying':
        // Death ends lying down; Standing starts from a crouch, so a long crossfade blends them.
        this.robot({ posture: 'standing' })
        this.emit({ op: 'clip', clip: 'Standing', timeScale: POSE_TIME_SCALE, fade: 0.6 })
        this.posture = 'standing'
        return
    }
  }

  private standUp(): void {
    this.robot({ posture: 'standing' })
    this.emit({ op: 'clip', clip: 'Standing', timeScale: POSE_TIME_SCALE, fade: 0.3 })
    this.posture = 'standing'
  }

  /** Wake-up face: surprised blink, head up, lamp back to full brightness. */
  private wakeFace(): void {
    this.emit(
      {
        op: 'parallel',
        steps: [
          { op: 'room', patch: { light: { dimmed: false } } },
          { op: 'expr', name: 'Surprised', weight: 0.9, ms: 300 },
          { op: 'head', pitch: 0, roll: 0, ms: 400 },
        ],
      },
      { op: 'expr', name: null, ms: 400 },
    )
    this.room.light.dimmed = false
  }

  /** Non-motion requests wake a sleeping (or lying) robot first; a sitting robot answers seated. */
  wakeIfNeeded(): void {
    if (this.posture === 'sleeping' || this.posture === 'lying') this.ensureStanding()
  }

  /**
   * A gesture + an answer: the robot nods/waves while it speaks. The full-body clips need a standing
   * robot; seated, a "No" becomes a shake of the head (procedural head op) and other gestures drop.
   */
  answer(clip: EmoteClip | null, ref: ReplyRef, before: Step[] = []): void {
    const talk: Step[] = [...before, { op: 'say', reply: ref, wait: true }]
    const gesture: Step | null =
      clip && this.standing ? { op: 'clip', clip } : clip === 'No' ? this.headShake() : null
    if (gesture) {
      this.emit({ op: 'parallel', steps: [gesture, { op: 'seq', steps: talk }] })
    } else {
      this.emit(...talk)
    }
  }

  /** "No" without the full-body clip (a seated robot): the head turns side to side, then back. */
  headShake(): Step {
    return {
      op: 'seq',
      steps: [
        { op: 'head', yaw: 0.35, ms: 200 },
        { op: 'head', yaw: -0.35, ms: 350 },
        { op: 'head', yaw: 0.35, ms: 350 },
        { op: 'head', yaw: 0, ms: 200 },
      ],
    }
  }

  gesture(clip: EmoteClip, repeat = 1): void {
    if (!this.standing) return
    this.emit(repeat > 1 ? { op: 'clip', clip, repeat } : { op: 'clip', clip })
  }

  blockedReaction(): void {
    this.emit(
      { op: 'expr', name: 'Surprised', weight: 0.6, ms: 250 },
      { op: 'say', reply: reply('motion.walk_blocked', {}), wait: false },
      { op: 'hold', ms: 700 },
      { op: 'expr', name: null, ms: 400 },
    )
  }
}

// ---------------------------------------------------------------------------------------------
// Normalisation (caps)

/**
 * The limit an action's count / steps / spins / seconds is held to (LIMITS in core/actions is the
 * single source of truth; reduced motion lowers repeat counts), or null when it has none.
 */
function limitOf(b: Builder, a: Action): CapInfo | null {
  switch (a.type) {
    case 'jump':
    case 'wave':
    case 'nod':
    case 'shake_head':
    case 'thumbs_up':
    case 'punch':
      return { action: a.type, unit: 'times', max: b.countCap }
    case 'turn':
      return a.direction === 'spin'
        ? { action: 'turn', unit: 'spins', max: Math.min(b.countCap, LIMITS.maxSpins) }
        : null
    case 'walk':
      return a.direction === 'to_user' || a.direction === 'home'
        ? null
        : { action: 'walk', unit: 'steps', max: LIMITS.maxSteps }
    case 'dance':
    case 'run':
      return { action: a.type, unit: 'seconds', max: LIMITS.maxMotionSeconds }
    default:
      return null
  }
}

/** The value `limitOf` limits. */
function amountOf(a: Action): number | null {
  if (a.type === 'walk') return a.steps
  if (a.type === 'dance' || a.type === 'run') return a.seconds
  return 'count' in a ? a.count : null
}

function normalize(b: Builder, a: Action): Action {
  if (a.type === 'unsupported') return a.alternative ? { ...a, alternative: normalize(b, a.alternative) } : a
  if (a.type === 'turn' && a.direction !== 'spin') return { ...a, count: 1 }
  const lim = limitOf(b, a)
  if (!lim) return a
  const { max, ...what } = lim
  switch (a.type) {
    case 'walk':
      return { ...a, steps: b.capCount(a.steps, max, what) }
    case 'dance':
    case 'run':
      if (a.seconds > max) b.noteCap(lim)
      return { ...a, seconds: clampNum(a.seconds, 1, max) }
    default:
      return 'count' in a ? { ...a, count: b.capCount(a.count, max, what) } : a
  }
}

/**
 * What 'note.capped' should name, in action order, each with its own unit (lần / bước / vòng /
 * giây). A cut action sits exactly at its limit after normalize(): the engine's own cuts are known;
 * the parser cuts too, but its note only carries the first limit, so when it has cut something every
 * (normalized) action at its limit is named.
 */
function capsToNote(b: Builder, actions: Action[], parserCapped: boolean): CapInfo[] {
  const out: CapInfo[] = []
  const add = (a: Action) => {
    const lim = limitOf(b, a)
    if (!lim || amountOf(a) !== lim.max) return
    const same = (c: CapInfo) => c.action === lim.action && c.unit === lim.unit
    if (!parserCapped && !b.caps.some(same)) return
    if (!out.some(same)) out.push(lim)
  }
  for (const a of actions) {
    add(a)
    if (a.type === 'unsupported' && a.alternative) add(a.alternative)
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Motion

function motionAck(a: MotionAction): ReplyRef {
  switch (a.type) {
    case 'jump':
      return reply('motion.jump', { count: a.count })
    case 'dance':
      return reply('motion.dance', { seconds: a.seconds })
    case 'wave':
      return reply('motion.wave', { count: a.count })
    case 'nod':
      return reply('motion.nod', { count: a.count })
    case 'shake_head':
      return reply('motion.shake_head', { count: a.count })
    case 'thumbs_up':
      return reply('motion.thumbs_up', { count: a.count })
    case 'punch':
      return reply('motion.punch', { count: a.count })
    case 'walk':
      return reply('motion.walk', { direction: a.direction, steps: a.steps })
    case 'run':
      return reply('motion.run', { seconds: a.seconds })
    case 'turn':
      return reply('motion.turn', { direction: a.direction, count: a.count })
    case 'sit':
      return reply('motion.sit', {})
    case 'stand':
      return reply('motion.stand', {})
    case 'sleep':
      return reply('motion.sleep', {})
    case 'wake':
      return reply('motion.wake', {})
    case 'fall':
      return reply('motion.fall', {})
    case 'emote':
      return reply('motion.emote', { emotion: a.emotion })
    case 'stop':
      return reply('motion.stop', {})
  }
}

/** Plans one motion action. Returns false when nothing was performed (a no-op or a blocked walk). */
function planMotion(b: Builder, a: MotionAction): boolean {
  switch (a.type) {
    case 'jump':
    case 'wave':
    case 'nod':
    case 'shake_head':
    case 'thumbs_up':
      b.ensureStanding()
      b.gesture(GESTURE_CLIP[a.type], a.count)
      return true

    case 'punch':
      b.ensureStanding()
      b.emit(
        {
          op: 'parallel',
          steps: [
            { op: 'expr', name: 'Angry', weight: 0.6, ms: 300 },
            a.count > 1 ? { op: 'clip', clip: 'Punch', repeat: a.count } : { op: 'clip', clip: 'Punch' },
          ],
        },
        { op: 'expr', name: null, ms: 400 },
      )
      return true

    case 'dance': {
      b.ensureStanding()
      const ms = b.reduced ? DANCE_CYCLE_MS : Math.max(DANCE_CYCLE_MS, Math.round(a.seconds * 1000))
      b.robot({ activity: 'dancing' })
      b.emit(
        { op: 'base', clip: 'Dance', fade: 0.5 },
        { op: 'hold', ms },
        { op: 'base', clip: 'Idle', fade: 0.5 },
      )
      b.robot({ activity: 'idle' })
      return true
    }

    case 'walk':
      b.ensureStanding()
      return planWalk(b, a)

    case 'run':
      b.ensureStanding()
      planRun(b, a.seconds)
      return true

    case 'turn':
      b.ensureStanding()
      planTurn(b, a)
      return true

    case 'sit':
      if (b.posture === 'sitting') {
        b.say(reply('motion.already_sitting', {}), false)
        return false
      }
      if (b.posture === 'sleeping') {
        // Already seated: just wake the face up.
        b.emit(
          {
            op: 'parallel',
            steps: [
              { op: 'room', patch: { light: { dimmed: false } } },
              { op: 'expr', name: null, ms: 400 },
              { op: 'head', pitch: 0, roll: 0, ms: 500 },
            ],
          },
          { op: 'robot', patch: { posture: 'sitting' } },
        )
        b.room.light.dimmed = false
        b.posture = 'sitting'
        return true
      }
      b.ensureStanding()
      b.robot({ posture: 'sitting' })
      b.emit({ op: 'clip', clip: 'Sitting', timeScale: POSE_TIME_SCALE, fade: 0.3 })
      b.posture = 'sitting'
      return true

    case 'stand':
      if (b.standing) {
        b.gesture('Yes')
        b.say(reply('motion.already_standing', {}), false)
        return false
      }
      b.ensureStanding()
      return true

    case 'sleep':
      if (b.posture === 'sleeping') {
        b.say(reply('motion.already_sleeping', {}), false)
        return false
      }
      if (b.posture === 'lying') b.ensureStanding()
      b.robot({ posture: 'sleeping', activity: 'idle' })
      if (b.posture === 'standing') {
        b.emit({ op: 'clip', clip: 'Sitting', timeScale: POSE_TIME_SCALE, fade: 0.3 })
      }
      b.emit({
        op: 'parallel',
        steps: [
          { op: 'room', patch: { light: { dimmed: true } } },
          { op: 'expr', name: 'Sad', weight: 0.4, ms: 800 },
          { op: 'head', pitch: 0.35, roll: 0, ms: 900 },
        ],
      })
      b.room.light.dimmed = true
      b.posture = 'sleeping'
      return true

    case 'wake':
      if (b.posture !== 'sleeping') {
        b.say(reply('motion.already_awake', {}), false)
        return false
      }
      b.ensureStanding()
      return true

    case 'fall':
      b.ensureStanding()
      b.robot({ posture: 'lying', activity: 'idle' })
      b.emit({ op: 'clip', clip: 'Death', fade: 0.2 }, { op: 'hold', ms: b.reduced ? 1500 : 2000 })
      b.posture = 'lying'
      b.ensureStanding()
      b.say(reply('motion.fall_recover', {}), false)
      return true

    case 'emote':
      planEmote(b, a.emotion)
      return true

    case 'stop':
      b.emit(
        { op: 'base', clip: 'Idle', fade: 0.25 },
        {
          op: 'parallel',
          steps: [
            { op: 'expr', name: null, ms: 250 },
            { op: 'head', pitch: 0, roll: 0, ms: 250 },
          ],
        },
      )
      b.robot({ activity: 'idle' })
      return true
  }
}

function planEmote(b: Builder, emotion: ActionOf<'emote'>['emotion']): void {
  const body = b.standing
  switch (emotion) {
    case 'sad':
      b.emit({
        op: 'parallel',
        steps: [
          { op: 'expr', name: 'Sad', weight: 0.9, ms: 400 },
          { op: 'head', pitch: 0.2, ms: 500 },
        ],
      })
      b.emit(
        { op: 'hold', ms: 2000 },
        {
          op: 'parallel',
          steps: [
            { op: 'expr', name: null, ms: 500 },
            { op: 'head', pitch: 0, ms: 500 },
          ],
        },
      )
      return
    case 'angry':
      b.emit({
        op: 'parallel',
        steps: [
          { op: 'expr', name: 'Angry', weight: 0.9, ms: 300 },
          ...(body ? [{ op: 'clip', clip: 'Punch' } as const] : [{ op: 'hold', ms: 900 } as const]),
        ],
      })
      b.emit({ op: 'hold', ms: 1200 }, { op: 'expr', name: null, ms: 500 })
      return
    case 'surprised':
      b.emit({
        op: 'parallel',
        steps: [
          { op: 'expr', name: 'Surprised', weight: 1, ms: 200 },
          ...(body ? [{ op: 'clip', clip: 'Jump' } as const] : [{ op: 'hold', ms: 700 } as const]),
        ],
      })
      b.emit({ op: 'hold', ms: 1000 }, { op: 'expr', name: null, ms: 500 })
      return
    case 'happy':
      // There is no smile morph target: happiness is body language.
      b.emit({ op: 'expr', name: null, ms: 300 })
      b.gesture('Jump')
      b.gesture('Yes')
      return
  }
}

function planTurn(b: Builder, a: ActionOf<'turn'>): void {
  switch (a.direction) {
    case 'left':
      b.turnTo(YAW_SCREEN_LEFT, { shuffle: true })
      return
    case 'right':
      b.turnTo(YAW_SCREEN_RIGHT, { shuffle: true })
      return
    case 'around':
      // normalizeAngle(π) = π, so "around" always turns the same (positive) way.
      b.turnTo(b.pose.yaw + Math.PI - 1e-6, { shuffle: true })
      return
    case 'spin': {
      const perTurn = b.reduced ? SPIN_MS.reduced : SPIN_MS.normal
      b.emit(
        {
          op: 'parallel',
          steps: [
            { op: 'expr', name: 'Surprised', weight: 0.3, ms: 300 },
            {
              op: 'turn',
              yaw: round(normalizeAngle(b.pose.yaw)),
              extraTurns: a.count,
              ms: perTurn * a.count,
            },
          ],
        },
        { op: 'expr', name: null, ms: 300 },
      )
      return
    }
  }
}

function planWalk(b: Builder, a: ActionOf<'walk'>): boolean {
  if (a.direction === 'to_user' || a.direction === 'home') {
    walkToPoint(b, a.direction === 'home' ? HOME : TO_USER)
    return true
  }
  const dist = a.steps * STEP_LENGTH
  const start = clampPoint(b.pose)
  if (a.direction === 'backward') {
    const m = moveAlong(start, b.pose.yaw + Math.PI, dist)
    if (m.fullyBlocked) {
      b.blockedReaction()
      return false
    }
    b.emit({ op: 'base', clip: 'Walking', timeScale: GAIT_TIME_SCALE.back, fade: 0.3 })
    b.robot({ activity: 'walking' })
    b.moveTo(m.to, SPEED.back)
    b.emit({ op: 'base', clip: 'Idle', fade: 0.3 })
    b.robot({ activity: 'idle' })
    if (m.blocked) b.blockedReaction()
    return true
  }

  const sideways = a.direction === 'left' || a.direction === 'right'
  const heading =
    a.direction === 'left' ? YAW_SCREEN_LEFT : a.direction === 'right' ? YAW_SCREEN_RIGHT : b.pose.yaw
  const m = moveAlong(start, heading, dist)
  if (m.fullyBlocked) {
    if (sideways) b.turnTo(heading, { shuffle: true })
    b.blockedReaction()
    if (sideways) b.turnTo(YAW_CAMERA, { shuffle: true })
    return false
  }
  // A bare "đi tới" (default steps) goes out and comes back, so repeated commands never pile the
  // robot up against the edge of the room.
  const outAndBack = a.direction === 'forward' && a.steps === DEFAULT_WALK_STEPS
  const originalYaw = b.pose.yaw

  b.emit({ op: 'base', clip: 'Walking', timeScale: GAIT_TIME_SCALE.walk, fade: 0.3 })
  b.robot({ activity: 'walking' })
  b.turnTo(heading)
  b.moveTo(m.to, SPEED.walk)
  if (outAndBack) {
    b.turnTo(heading + Math.PI - 1e-6)
    b.moveTo(start, SPEED.walk)
    b.turnTo(originalYaw)
  }
  b.emit({ op: 'base', clip: 'Idle', fade: 0.3 })
  b.robot({ activity: 'idle' })
  if (sideways) b.turnTo(YAW_CAMERA, { shuffle: true })
  if (m.blocked && !outAndBack) b.blockedReaction()
  return true
}

function walkToPoint(b: Builder, target: Vec2): void {
  if (distance(b.pose, target) >= 0.05) {
    b.emit({ op: 'base', clip: 'Walking', timeScale: GAIT_TIME_SCALE.walk, fade: 0.3 })
    b.robot({ activity: 'walking' })
    b.turnTo(yawTowards(b.pose, target))
    b.moveTo(target, SPEED.walk)
    b.emit({ op: 'base', clip: 'Idle', fade: 0.3 })
    b.robot({ activity: 'idle' })
  }
  b.turnTo(YAW_CAMERA, { shuffle: true })
}

/** Runs go back and forth along x (the clips play in place), then return to the start. */
function planRun(b: Builder, seconds: number): void {
  const start = clampPoint(b.pose)
  const budget = SPEED.run * (b.reduced ? Math.min(seconds, 4) : seconds)
  const points: Vec2[] = []
  let targetX = start.x <= 0 ? RUN_HALF_WIDTH : -RUN_HALF_WIDTH
  let cur = start
  let travelled = 0
  do {
    const next = { x: targetX, z: start.z }
    travelled += Math.abs(next.x - cur.x)
    points.push(next)
    cur = next
    targetX = -targetX
  } while (travelled + Math.abs(cur.x - start.x) < budget && points.length < 8)
  points.push(start)

  b.emit({ op: 'base', clip: 'Running', timeScale: GAIT_TIME_SCALE.run, fade: 0.3 })
  b.robot({ activity: 'running' })
  let from: Vec2 = start
  for (const p of points) {
    if (distance(from, p) < 0.05) continue
    b.turnTo(yawTowards(from, p), { fast: true })
    b.moveTo(p, SPEED.run)
    from = p
  }
  b.emit({ op: 'base', clip: 'Idle', fade: 0.4 })
  b.robot({ activity: 'idle' })
  b.turnTo(YAW_CAMERA, { shuffle: true })
}

/**
 * A run of consecutive motion actions: one acknowledgement, then the body steps. The replies of
 * no-ops ("Mình đang ngồi rồi nè!") come first, so the chain reads in order: "I'm already sitting!
 * … I'll walk 2 steps." (A blocked walk keeps its reply where the walk is.)
 */
function planMotionRun(b: Builder, actions: MotionAction[], opts: { ack: boolean }): void {
  const performed: MotionAction[] = []
  const noopReplies: Step[] = []
  const steps: Step[] = []
  for (const a of actions) {
    const r = { did: false }
    const own = b.capture(() => {
      r.did = planMotion(b, a)
    })
    if (r.did) performed.push(a)
    const noop = !r.did && a.type !== 'walk'
    for (const s of own) (noop && s.op === 'say' ? noopReplies : steps).push(s)
  }
  b.emit(...noopReplies)
  if (opts.ack && performed.length > 0) {
    const ack =
      performed.length === 1 ? motionAck(performed[0]!) : reply('motion.chain', { actions: performed })
    b.say(ack, false)
  }
  b.emit(...steps)
}

// ---------------------------------------------------------------------------------------------
// Information, conversation, preferences

/** (parser) The question / explanation for a 'clarify' action. */
function clarifyReply(a: ActionOf<'clarify'>): ReplyRef {
  const label = a.label ? { label: a.label } : {}
  if (a.need === 'clock_time') return reply('timer.clock_time', label)
  if (a.need === 'device_later')
    return reply('home.later', { device: a.device ?? 'light', power: a.power ?? 'on' })
  return reply('timer.ask', label)
}

function planInfo(b: Builder, a: Action): void {
  b.wakeIfNeeded()
  b.faceCamera()
  const iso = b.iso
  switch (a.type) {
    case 'time':
      b.answer('Yes', reply('info.time', { iso }), [
        { op: 'card', card: { kind: 'time', iso }, ttlMs: CARD_TTL.time },
      ])
      return
    case 'date':
      b.answer('Yes', reply('info.date', { iso, dayOffset: a.dayOffset }), [
        { op: 'card', card: { kind: 'date', iso, dayOffset: a.dayOffset }, ttlMs: CARD_TTL.date },
      ])
      return
    case 'weekday':
      b.answer('Yes', reply('info.weekday', { iso, dayOffset: a.dayOffset }), [
        { op: 'card', card: { kind: 'date', iso, dayOffset: a.dayOffset }, ttlMs: CARD_TTL.date },
      ])
      return
    case 'lunar': {
      // The lunar card has no day offset: give it the instant of the day being asked about.
      const cardIso =
        a.query === 'date' && a.dayOffset !== 0
          ? new Date(b.snap.now.getTime() + a.dayOffset * 86_400_000).toISOString()
          : iso
      // (parser) a named month / another year: the reply answers it; the card only knows "next"
      const named = a.month !== undefined || a.yearOffset !== undefined
      const extra = {
        ...(a.month !== undefined ? { month: a.month } : {}),
        ...(a.yearOffset !== undefined ? { yearOffset: a.yearOffset } : {}),
      }
      b.answer(
        'Yes',
        reply('info.lunar', { iso, query: a.query, dayOffset: a.dayOffset, ...extra }),
        named
          ? []
          : [{ op: 'card', card: { kind: 'lunar', iso: cardIso, query: a.query }, ttlMs: CARD_TTL.lunar }],
      )
      return
    }
    case 'timer_start': {
      const start: Step = { op: 'timer_start', seconds: a.seconds, ...(a.label ? { label: a.label } : {}) }
      if (b.standing) b.emit({ op: 'parallel', steps: [{ op: 'clip', clip: 'ThumbsUp' }, start] })
      else b.emit(start)
      return
    }
    case 'timer_cancel': {
      // With a label only that reminder goes ("hủy nhắc uống thuốc"); without, every timer.
      const cancel: Step = { op: 'timer_cancel', ...(a.label ? { label: a.label } : {}) }
      if (b.standing) b.emit({ op: 'parallel', steps: [{ op: 'clip', clip: 'Yes' }, cancel] })
      else b.emit(cancel)
      return
    }
    case 'timer_status':
      b.emit({ op: 'timer_status' })
      return
    case 'weather':
      // (parser) an unknown place was named: say so before answering for the default place
      if (a.placeUnknown && !a.place)
        b.say(reply('info.weather_unknown_place', { place: DEFAULT_PLACE.name }), true)
      b.emit({ op: 'weather', place: a.place ?? DEFAULT_PLACE, dayOffset: a.dayOffset, aspect: a.aspect })
      return
    case 'clarify':
      // (parser) understood but not doable as said: ask / explain, never a refusal and no clip
      b.answer(null, clarifyReply(a))
      return
    case 'math': {
      const card: Step = {
        op: 'card',
        card: { kind: 'math', expr: a.expr, result: a.result, ...(a.error ? { error: a.error } : {}) },
        ttlMs: CARD_TTL.math,
      }
      if (a.result !== null && !a.error) {
        b.answer('Yes', reply('info.math', { expr: a.expr, result: a.result }), [card])
      } else {
        b.answer('No', reply('info.math_error', { expr: a.expr, error: a.error ?? 'overflow' }), [card])
      }
      return
    }
    default:
      return
  }
}

function planChat(b: Builder, a: Action): void {
  if (a.type === 'voice') {
    b.emit({ op: 'pref', muted: !a.on })
    b.say(reply('pref.voice', { on: a.on }), true)
    return
  }
  if (a.type === 'set_language') {
    b.emit({ op: 'pref', lang: a.lang })
    b.say(reply('pref.language', { lang: a.lang }), true)
    return
  }
  b.wakeIfNeeded()
  b.faceCamera()
  switch (a.type) {
    case 'greet':
      b.answer('Wave', reply('chat.greet', { iso: b.iso }))
      return
    case 'thanks':
      b.answer('Yes', reply('chat.thanks', {}))
      return
    case 'goodbye':
      b.answer('Wave', reply('chat.goodbye', {}))
      return
    case 'praise':
      b.answer('ThumbsUp', reply('chat.praise', {}))
      return
    case 'insult':
      b.emit({ op: 'expr', name: 'Sad', weight: 0.7, ms: 400 })
      b.answer('No', reply('chat.insult', {}))
      b.emit({ op: 'expr', name: null, ms: 500 })
      return
    case 'intro': {
      const about: Step[] = [{ op: 'card', card: { kind: 'about' }, ttlMs: CARD_TTL.about }]
      if (a.topic === 'who') b.answer('Wave', reply('chat.intro', { topic: 'who' }), about)
      else if (a.topic === 'project') {
        const wer = b.projectWer
        b.answer(
          'Yes',
          reply('chat.intro', wer === undefined ? { topic: 'project' } : { topic: 'project', wer }),
          about,
        )
      } else b.answer('Yes', reply('chat.intro', { topic: a.topic }))
      return
    }
    case 'capabilities':
      b.answer('ThumbsUp', reply('chat.capabilities', {}), [
        { op: 'card', card: { kind: 'capabilities' }, ttlMs: CARD_TTL.capabilities },
      ])
      return
    case 'joke':
      b.say(reply('chat.joke', { index: b.nextJoke() }), true)
      b.gesture('Jump')
      return
    case 'smalltalk': {
      const clip: Record<typeof a.topic, EmoteClip> = {
        how_are_you: 'ThumbsUp',
        love: 'Wave',
        user_sad: 'Yes',
        user_tired: 'Yes',
        user_happy: 'Jump',
      }
      if (a.topic === 'user_sad') b.emit({ op: 'expr', name: 'Sad', weight: 0.5, ms: 400 })
      b.answer(clip[a.topic], reply('chat.smalltalk', { topic: a.topic }))
      if (a.topic === 'user_sad') b.emit({ op: 'expr', name: null, ms: 500 })
      return
    }
    case 'emergency':
      // (parser) a possible real emergency: a concerned face and a serious answer, never a clip
      b.emit({ op: 'expr', name: 'Sad', weight: 0.5, ms: 400 })
      b.answer(null, reply('chat.emergency', {}))
      b.emit({ op: 'expr', name: null, ms: 500 })
      return
    default:
      return
  }
}

// ---------------------------------------------------------------------------------------------
// Smart home

interface HomeFlags {
  blackIsOff: boolean
  xanhAmbiguous: boolean
  /** Set when a flag's reply was used by a light action. */
  usedBlack: boolean
  usedXanh: boolean
}

/** The lamp/fan: turn to look at it, nod, and switch it mid-nod (then the reply lands). */
function applyDevice(
  b: Builder,
  pos: Vec2,
  patch: Extract<Step, { op: 'room' }>['patch'],
  ref: ReplyRef,
): void {
  const change: Step[] = [
    { op: 'room', patch },
    { op: 'say', reply: ref, wait: false },
  ]
  if (b.standing) {
    b.turnTo(yawTowards(b.pose, pos), { shuffle: true })
    const mid = Math.round(CLIP_DURATION.Yes * 1000 * 0.5)
    b.emit({
      op: 'parallel',
      steps: [
        { op: 'clip', clip: 'Yes' },
        { op: 'seq', steps: [{ op: 'hold', ms: mid }, ...change] },
      ],
    })
  } else {
    b.emit(...change)
  }
}

function planLight(b: Builder, a: ActionOf<'light'>, flags: HomeFlags): void {
  const cur = b.room.light
  const off = a.power === 'off'
  if (off) {
    const ref = flags.blackIsOff
      ? reply('home.black_is_off', {})
      : cur.on
        ? reply('home.light_off', {})
        : reply('home.light_already', { on: false })
    if (flags.blackIsOff) flags.usedBlack = true
    if (!cur.on) {
      b.gesture('Yes')
      b.say(ref, false)
      return
    }
    applyDevice(b, LAMP_POS, { light: { on: false } }, ref)
    b.room.light.on = false
    return
  }
  const color = a.color
  if (color === undefined || color === cur.color) {
    if (cur.on) {
      b.gesture('Yes')
      b.say(reply('home.light_already', { on: true }), false)
      return
    }
    applyDevice(b, LAMP_POS, { light: { on: true } }, reply('home.light_on', color ? { color } : {}))
    b.room.light.on = true
    return
  }
  let ref: ReplyRef
  if (color === 'teal' && flags.xanhAmbiguous) {
    ref = reply('home.xanh_ambiguous', {})
    flags.usedXanh = true
  } else ref = cur.on ? reply('home.light_color', { color }) : reply('home.light_on', { color })
  applyDevice(b, LAMP_POS, { light: { on: true, color } }, ref)
  b.room.light.on = true
  b.room.light.color = color
}

function planFan(b: Builder, a: ActionOf<'fan'>): void {
  const cur = b.room.fan
  const noop = (on: boolean) => {
    b.gesture('Yes')
    b.say(reply('home.fan_already', { on }), false)
  }
  if (a.power === 'off') {
    if (!cur.on) return noop(false)
    applyDevice(b, FAN_POS, { fan: { on: false } }, reply('home.fan_off', {}))
    b.room.fan.on = false
    return
  }
  if (a.speedDelta !== undefined) {
    const next = Math.min(3, Math.max(1, cur.speed + a.speedDelta)) as FanSpeed
    if (!cur.on) {
      applyDevice(b, FAN_POS, { fan: { on: true, speed: next } }, reply('home.fan_on', { speed: next }))
    } else if (next === cur.speed) {
      b.gesture('Yes')
      b.say(reply('home.fan_speed_limit', { speed: cur.speed }), false)
      return
    } else {
      applyDevice(
        b,
        FAN_POS,
        { fan: { speed: next } },
        reply('home.fan_speed', { speed: next, delta: a.speedDelta }),
      )
    }
    b.room.fan = { on: true, speed: next }
    return
  }
  const speed = a.speed ?? cur.speed
  if (cur.on && speed === cur.speed) return noop(true)
  const ref = cur.on ? reply('home.fan_speed', { speed }) : reply('home.fan_on', { speed })
  applyDevice(b, FAN_POS, { fan: { on: true, speed } }, ref)
  b.room.fan = { on: true, speed }
}

// ---------------------------------------------------------------------------------------------
// Meta

function planUnsupported(b: Builder, a: ActionOf<'unsupported'>, flags: HomeFlags): void {
  b.wakeIfNeeded()
  b.faceCamera()
  const cand = a.alternative
  // Anything doable except meta actions and "stop" can be offered (and then performed).
  const alt =
    cand && cand.type !== 'stop' && actionCategory(cand.type) !== 'meta' && cand.type !== 'set_language'
      ? cand
      : undefined
  const params = {
    reason: a.reason,
    verb: a.verb,
    ...(a.object ? { object: a.object } : {}),
    ...(alt ? { alternative: alt.type } : {}),
  }
  const sad: Step = { op: 'expr', name: 'Sad', weight: 0.8, ms: 400 }
  // A polite refusal always comes with a head shake: the No clip standing, the head alone seated.
  b.emit({
    op: 'parallel',
    steps: [
      sad,
      b.standing ? { op: 'clip', clip: 'No' } : b.headShake(),
      { op: 'say', reply: reply('unsupported', params), wait: true },
    ],
  })
  b.emit({ op: 'expr', name: null, ms: 400 })
  if (!alt) return
  // The refusal already offers the alternative ("…nhưng mình nhảy được nè!"), so no second ack.
  if (isMotion(alt)) planMotionRun(b, [alt], { ack: false })
  else if (alt.type === 'light') planLight(b, alt, flags)
  else if (alt.type === 'fan') planFan(b, alt)
  else if (actionCategory(alt.type) === 'info') planInfo(b, alt)
  else planChat(b, alt)
}

function planUnknown(b: Builder, suggestions: Suggestion[]): void {
  const ref = reply('unknown', { suggestions: suggestions.slice(0, 3).map((s) => s.say) })
  b.emit({
    op: 'parallel',
    steps: [
      { op: 'say', reply: ref, wait: true },
      {
        op: 'seq',
        steps: [
          {
            op: 'parallel',
            steps: [
              { op: 'head', roll: 0.3, ms: 300 },
              { op: 'expr', name: 'Surprised', weight: 0.6, ms: 300 },
            ],
          },
          { op: 'hold', ms: 1200 },
          {
            op: 'parallel',
            steps: [
              { op: 'head', roll: 0, ms: 300 },
              { op: 'expr', name: null, ms: 300 },
            ],
          },
        ],
      },
    ],
  })
}

// ---------------------------------------------------------------------------------------------
// Entry points

export function plan(req: PlanRequest, snap: PlannerSnapshot): Plan {
  const b = new Builder(snap)
  let actions = req.actions
  const tooMany = req.tooMany === true || actions.length > LIMITS.maxActions
  if (actions.length > LIMITS.maxActions) actions = actions.slice(0, LIMITS.maxActions)
  actions = actions.map((a) => normalize(b, a))

  const has = (k: Note['kind']) => req.notes.some((n) => n.kind === k)
  const parserCap = req.notes.find((n) => n.kind === 'capped')
  const parserMax = typeof parserCap?.data?.max === 'number' ? parserCap.data.max : LIMITS.maxCount
  // Every capped action with its own limit and unit ("xoay tối đa 5 vòng và nhảy tối đa 10 lần").
  const caps = capsToNote(b, actions, parserCap !== undefined)

  // Heads-up notes first (non-blocking), so the robot says "10 times at most" before doing it.
  if (caps.length > 0) b.say(reply('note.capped', { max: Math.min(...caps.map((c) => c.max)), caps }), false)
  else if (parserCap) b.say(reply('note.capped', { max: parserMax }), false)
  if (tooMany) b.say(reply('note.too_many_actions', { max: LIMITS.maxActions }), false)

  const flags: HomeFlags = {
    blackIsOff: has('black_is_off'),
    xanhAmbiguous: has('xanh_ambiguous'),
    usedBlack: false,
    usedXanh: false,
  }

  if (actions.length === 0) {
    if (has('nothing_to_repeat') && !req.hasUnknown) b.say(reply('note.nothing_to_repeat', {}), true)
    else if (flags.blackIsOff) b.say(reply('home.black_is_off', {}), true)
    else planUnknown(b, req.suggestions)
    return { steps: b.steps, needsBody: false, jokesUsed: b.jokesUsed }
  }

  if (has('nothing_to_repeat')) b.say(reply('note.nothing_to_repeat', {}), false)

  let needsBody = false
  for (let i = 0; i < actions.length;) {
    const a = actions[i]!
    if (isMotion(a)) {
      const run: MotionAction[] = []
      while (i < actions.length && isMotion(actions[i]!)) run.push(actions[i++] as MotionAction)
      needsBody = true
      planMotionRun(b, run, { ack: true })
      continue
    }
    i++
    switch (actionCategory(a.type)) {
      case 'info':
        planInfo(b, a)
        break
      case 'chat':
        planChat(b, a)
        break
      case 'home': {
        b.wakeIfNeeded()
        if (a.type === 'light') planLight(b, a, flags)
        else if (a.type === 'fan') planFan(b, a)
        const next = actions[i]
        if (!next || actionCategory(next.type) !== 'home') b.faceCamera()
        break
      }
      default:
        if (a.type === 'unsupported') {
          if (a.alternative && isMotion(a.alternative)) needsBody = true
          planUnsupported(b, a, flags)
        } else if (a.type === 'ack_negation') {
          b.answer(
            'Yes',
            reply('negation', a.emotion ? { target: a.target, emotion: a.emotion } : { target: a.target }),
          )
        }
    }
  }

  // Notes whose light action was not there (e.g. only "màu đen").
  if (flags.blackIsOff && !flags.usedBlack) b.say(reply('home.black_is_off', {}), true)
  if (flags.xanhAmbiguous && !flags.usedXanh) b.say(reply('home.xanh_ambiguous', {}), true)
  if (req.hasUnknown) b.say(reply('partial_unknown', {}), true)

  return { steps: b.steps, needsBody, jokesUsed: b.jokesUsed }
}

/** The alarm's announcement: one assertive reply per expired timer, in the given order, then the beep. */
function alarmNotice(b: Builder, labels: readonly (string | undefined)[]): void {
  for (const label of labels.length > 0 ? labels : [undefined]) {
    b.say(reply('timer.done', label ? { label } : {}), false, { assertive: true })
  }
  b.emit({ op: 'beep' })
}

/**
 * The timer alarm: pre-empts whatever is running. `labels` = the timers that expired together
 * (soonest first); each one is announced ("Đến giờ uống thuốc rồi!"), with one beep and one jump.
 */
export function planAlarm(snap: PlannerSnapshot, labels: readonly (string | undefined)[]): Plan {
  const b = new Builder(snap)
  alarmNotice(b, labels)
  b.ensureStanding()
  b.faceCamera()
  b.emit(
    {
      op: 'parallel',
      steps: [
        { op: 'expr', name: 'Surprised', weight: 0.8, ms: 200 },
        snap.reducedMotion ? { op: 'clip', clip: 'Jump' } : { op: 'clip', clip: 'Jump', repeat: 2 },
      ],
    },
    { op: 'clip', clip: 'Wave' },
    { op: 'expr', name: null, ms: 400 },
  )
  return { steps: b.steps, needsBody: false, jokesUsed: 0 }
}

/**
 * Only the announcement of alarms that are still due (no body): used when a command interrupts
 * the alarm on screen before the alarms queued behind it were announced.
 */
export function planAlarmNotice(snap: PlannerSnapshot, labels: readonly (string | undefined)[]): Plan {
  const b = new Builder(snap)
  alarmNotice(b, labels)
  return { steps: b.steps, needsBody: false, jokesUsed: 0 }
}

/** true when the action needs the robot's body: a motion, or a refusal whose alternative is one. */
export function actionNeedsBody(a: Action): boolean {
  return isMotion(a) || (a.type === 'unsupported' && a.alternative !== undefined && isMotion(a.alternative))
}

/**
 * For a request that needs the 3D robot while it is still loading: `now` = everything that needs no
 * body (answers, timers, the room, the notes) and runs at once; `later` = the motion (with its cap
 * note), planned when the robot is there. null when there is nothing to split (all motion, or none).
 * The LIMITS.maxActions cut happens here, and its note goes with `now`.
 */
export function splitForBody(req: PlanRequest): { now: PlanRequest; later: PlanRequest } | null {
  const tooMany = req.tooMany === true || req.actions.length > LIMITS.maxActions
  const actions = req.actions.slice(0, LIMITS.maxActions)
  const body = actions.filter(actionNeedsBody)
  const rest = actions.filter((a) => !actionNeedsBody(a))
  if (body.length === 0 || rest.length === 0) return null
  return {
    now: {
      actions: rest,
      notes: req.notes.filter((n) => n.kind !== 'capped'),
      hasUnknown: req.hasUnknown,
      suggestions: req.suggestions,
      tooMany,
    },
    later: {
      actions: body,
      notes: req.notes.filter((n) => n.kind === 'capped'),
      hasUnknown: false,
      suggestions: [],
    },
  }
}

/** Welcome: bubble only (no TTS before the first user gesture), plus a wave. */
export function planWelcome(snap: PlannerSnapshot, layout: 'side' | 'stacked'): Plan {
  const b = new Builder(snap)
  b.say(reply('welcome', { layout }), false, { silent: true })
  b.gesture('Wave')
  return { steps: b.steps, needsBody: false, jokesUsed: 0 }
}

/** The "Về chỗ cũ" button: walk home and face the viewer, silently. */
export function planReturnHome(snap: PlannerSnapshot): Plan {
  const b = new Builder(snap)
  b.ensureStanding()
  walkToPoint(b, HOME)
  return { steps: b.steps, needsBody: true, jokesUsed: 0 }
}

/** Flattened list of step ops (handy for tests and debugging). */
export function flattenOps(steps: Step[]): string[] {
  const out: string[] = []
  for (const s of steps) {
    if (s.op === 'parallel' || s.op === 'seq') out.push(...flattenOps(s.steps))
    else out.push(s.op)
  }
  return out
}

/** Every reply a plan will show, in order (weather/timer replies are decided at run time). */
export function plannedReplies(steps: Step[]): ReplyRef[] {
  const out: ReplyRef[] = []
  for (const s of steps) {
    if (s.op === 'parallel' || s.op === 'seq') out.push(...plannedReplies(s.steps))
    else if (s.op === 'say') out.push(s.reply)
  }
  return out
}
