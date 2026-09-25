import { describe, expect, it } from 'vitest'
import type { Action } from '@/core/actions'
import type { ReplyRef } from '@/core/replies'
import { DEFAULT_ROOM } from '@/core/room'
import { renderReply } from '@/replies'
import { YAW_SCREEN_LEFT, YAW_SCREEN_RIGHT } from './bounds'
import {
  plan,
  planAlarm,
  planAlarmNotice,
  plannedReplies,
  planReturnHome,
  planWelcome,
  flattenOps,
  splitForBody,
  type PlanRequest,
} from './planner'
import { STEP_LENGTH, TO_USER } from './spec'
import type { PlannerSnapshot, Step } from './types'

const snap = (over: Partial<PlannerSnapshot> = {}): PlannerSnapshot => ({
  now: new Date('2026-09-24T03:00:00Z'),
  posture: 'standing',
  pose: { x: 0, z: 0, yaw: 0 },
  room: structuredClone(DEFAULT_ROOM),
  reducedMotion: false,
  jokeIndex: 0,
  ...over,
})

const req = (actions: Action[], over: Partial<PlanRequest> = {}): PlanRequest => ({
  actions,
  notes: [],
  hasUnknown: false,
  suggestions: [],
  ...over,
})

/** Every leaf step, depth first. */
function leaves(steps: Step[]): Step[] {
  return steps.flatMap((s) => (s.op === 'parallel' || s.op === 'seq' ? leaves(s.steps) : [s]))
}

const keys = (refs: ReplyRef[]) => refs.map((r) => r.key)
const ofOp = <O extends Step['op']>(steps: Step[], op: O) =>
  leaves(steps).filter((s): s is Extract<Step, { op: O }> => s.op === op)
const clips = (steps: Step[]) => ofOp(steps, 'clip').map((s) => s.clip)

describe('planner — posture prelude', () => {
  it('stands up before jumping when sitting', () => {
    const p = plan(req([{ type: 'jump', count: 1 }]), snap({ posture: 'sitting' }))
    expect(clips(p.steps)).toEqual(['Standing', 'Jump'])
    expect(ofOp(p.steps, 'robot')[0]?.patch).toEqual({ posture: 'standing' })
    expect(p.needsBody).toBe(true)
  })

  it('wakes up (undims the lamp) before standing when sleeping', () => {
    const p = plan(req([{ type: 'wave', count: 1 }]), snap({ posture: 'sleeping' }))
    const ops = flattenOps(p.steps)
    expect(ops.indexOf('room')).toBeLessThan(ops.indexOf('clip'))
    expect(ofOp(p.steps, 'room')[0]?.patch).toEqual({ light: { dimmed: false } })
    expect(clips(p.steps)).toEqual(['Standing', 'Wave'])
  })

  it('gets up from lying with a long crossfade', () => {
    const p = plan(req([{ type: 'nod', count: 1 }]), snap({ posture: 'lying' }))
    const standing = ofOp(p.steps, 'clip').find((s) => s.clip === 'Standing')
    expect(standing?.fade).toBe(0.6)
  })

  it('answers questions seated (no prelude), but wakes up a sleeping robot', () => {
    expect(clips(plan(req([{ type: 'time' }]), snap({ posture: 'sitting' })).steps)).not.toContain('Standing')
    expect(clips(plan(req([{ type: 'time' }]), snap({ posture: 'sleeping' })).steps)).toContain('Standing')
  })

  it('"ngồi xuống" when already sitting is a no-op with its own reply', () => {
    const p = plan(req([{ type: 'sit' }]), snap({ posture: 'sitting' }))
    expect(keys(plannedReplies(p.steps))).toEqual(['motion.already_sitting'])
    expect(clips(p.steps)).toEqual([])
  })
})

describe('planner — caps', () => {
  it('caps repeat counts at LIMITS.maxCount and says so first', () => {
    const p = plan(req([{ type: 'jump', count: 50 }]), snap())
    expect(ofOp(p.steps, 'clip')[0]).toMatchObject({ clip: 'Jump', repeat: 10 })
    const replies = plannedReplies(p.steps)
    expect(replies[0]).toEqual({
      key: 'note.capped',
      params: { max: 10, caps: [{ action: 'jump', unit: 'times', max: 10 }] },
      seed: undefined,
    })
    expect(replies[1]).toMatchObject({ key: 'motion.jump', params: { count: 10 } })
  })

  it('caps at maxCountReducedMotion with reduced motion', () => {
    const p = plan(req([{ type: 'wave', count: 5 }]), snap({ reducedMotion: true }))
    expect(ofOp(p.steps, 'clip')[0]).toMatchObject({ clip: 'Wave', repeat: 3 })
    expect(plannedReplies(p.steps)[0]).toMatchObject({ key: 'note.capped', params: { max: 3 } })
  })

  it("relays the parser's capped note", () => {
    const p = plan(
      req([{ type: 'jump', count: 10 }], { notes: [{ kind: 'capped', data: { max: 10 } }] }),
      snap(),
    )
    expect(plannedReplies(p.steps)[0]).toMatchObject({
      key: 'note.capped',
      params: { max: 10, caps: [{ action: 'jump', unit: 'times', max: 10 }] },
    })
  })

  it('drops actions beyond LIMITS.maxActions', () => {
    const actions: Action[] = Array.from({ length: 8 }, () => ({ type: 'nod', count: 1 }))
    const p = plan(req(actions), snap())
    expect(clips(p.steps).filter((c) => c === 'Yes')).toHaveLength(6)
    expect(keys(plannedReplies(p.steps))[0]).toBe('note.too_many_actions')
  })
})

describe('planner — locomotion', () => {
  it('"đi sang trái" walks toward SCREEN left (−x), then faces the camera again', () => {
    const p = plan(req([{ type: 'walk', direction: 'left', steps: 2 }]), snap())
    const turns = ofOp(p.steps, 'turn')
    expect(turns[0]?.yaw).toBeCloseTo(YAW_SCREEN_LEFT)
    expect(turns.at(-1)?.yaw).toBeCloseTo(0)
    expect(ofOp(p.steps, 'move')[0]?.to).toEqual({ x: -2 * STEP_LENGTH, z: 0 })
  })

  it('"đi sang phải" walks toward screen right (+x)', () => {
    const p = plan(req([{ type: 'walk', direction: 'right', steps: 2 }]), snap())
    expect(ofOp(p.steps, 'turn')[0]?.yaw).toBeCloseTo(YAW_SCREEN_RIGHT)
    expect(ofOp(p.steps, 'move')[0]?.to.x).toBeGreaterThan(0)
  })

  it('"quay trái" turns to face screen left', () => {
    const p = plan(req([{ type: 'turn', direction: 'left', count: 1 }]), snap())
    expect(ofOp(p.steps, 'turn')[0]?.yaw).toBeCloseTo(-Math.PI / 2)
  })

  it('a bare "đi tới" (default 3 steps) goes out and back', () => {
    const p = plan(req([{ type: 'walk', direction: 'forward', steps: 3 }]), snap())
    const moves = ofOp(p.steps, 'move').map((m) => m.to)
    expect(moves).toEqual([
      { x: 0, z: 3 * STEP_LENGTH },
      { x: 0, z: 0 },
    ])
    expect(ofOp(p.steps, 'turn').at(-1)?.yaw).toBeCloseTo(0)
  })

  it('an explicit step count does not come back', () => {
    const p = plan(req([{ type: 'walk', direction: 'forward', steps: 2 }]), snap())
    expect(ofOp(p.steps, 'move').map((m) => m.to)).toEqual([{ x: 0, z: 2 * STEP_LENGTH }])
  })

  it('a walk into the wall does not move and says motion.walk_blocked', () => {
    const p = plan(
      req([{ type: 'walk', direction: 'left', steps: 3 }]),
      snap({ pose: { x: -2.4, z: 0, yaw: 0 } }),
    )
    expect(ofOp(p.steps, 'move')).toEqual([])
    expect(keys(plannedReplies(p.steps))).toEqual(['motion.walk_blocked'])
  })

  it('a walk cut short by the wall still moves, then says motion.walk_blocked', () => {
    const p = plan(
      req([{ type: 'walk', direction: 'right', steps: 5 }]),
      snap({ pose: { x: 1.8, z: 0, yaw: 0 } }),
    )
    expect(ofOp(p.steps, 'move')[0]?.to.x).toBeCloseTo(2.4)
    expect(keys(plannedReplies(p.steps))).toEqual(['motion.walk', 'motion.walk_blocked'])
  })

  it('"lại đây" walks to the viewer and "về chỗ cũ" walks home, both ending facing the camera', () => {
    const come = plan(req([{ type: 'walk', direction: 'to_user', steps: 1 }]), snap())
    expect(ofOp(come.steps, 'move').at(-1)?.to).toEqual(TO_USER)
    const home = plan(
      req([{ type: 'walk', direction: 'home', steps: 1 }]),
      snap({ pose: { x: 1, z: 1, yaw: 1 } }),
    )
    expect(ofOp(home.steps, 'move').at(-1)?.to).toEqual({ x: 0, z: 0 })
    expect(ofOp(home.steps, 'turn').at(-1)?.yaw).toBeCloseTo(0)
  })

  it('planReturnHome walks home silently', () => {
    const p = planReturnHome(snap({ pose: { x: -1, z: 1.5, yaw: 2 } }))
    expect(ofOp(p.steps, 'move').at(-1)?.to).toEqual({ x: 0, z: 0 })
    expect(plannedReplies(p.steps)).toEqual([])
    expect(p.needsBody).toBe(true)
  })
})

describe('planner — replies', () => {
  it('a chain of motion gets ONE non-blocking acknowledgement at the start', () => {
    const p = plan(
      req([
        { type: 'jump', count: 3 },
        { type: 'wave', count: 1 },
      ]),
      snap(),
    )
    expect(p.steps[0]).toMatchObject({ op: 'say', wait: false, reply: { key: 'motion.chain' } })
    const chain = p.steps[0] as Extract<Step, { op: 'say' }>
    expect(chain.reply.params).toEqual({
      actions: [
        { type: 'jump', count: 3 },
        { type: 'wave', count: 1 },
      ],
    })
    expect(keys(plannedReplies(p.steps))).toEqual(['motion.chain'])
    expect(clips(p.steps)).toEqual(['Jump', 'Wave'])
  })

  it('info and chat answers face the camera first and block', () => {
    const p = plan(req([{ type: 'time' }]), snap({ pose: { x: 0, z: 0, yaw: Math.PI / 2 } }))
    const ops = flattenOps(p.steps)
    expect(ops.indexOf('turn')).toBeLessThan(ops.indexOf('say'))
    expect(ofOp(p.steps, 'turn')[0]?.yaw).toBeCloseTo(0)
    expect(ofOp(p.steps, 'say')[0]).toMatchObject({ wait: true, reply: { key: 'info.time' } })
    expect(ofOp(p.steps, 'card')[0]?.card.kind).toBe('time')

    const g = plan(req([{ type: 'greet' }]), snap({ pose: { x: 0, z: 0, yaw: -Math.PI / 2 } }))
    expect(ofOp(g.steps, 'turn')[0]?.yaw).toBeCloseTo(0)
    expect(keys(plannedReplies(g.steps))).toEqual(['chat.greet'])
  })

  it('does not turn when already facing the camera', () => {
    expect(ofOp(plan(req([{ type: 'time' }]), snap()).steps, 'turn')).toEqual([])
  })

  it('an unsupported request is refused, then the alternative is performed without a second ack', () => {
    const p = plan(
      req([
        {
          type: 'unsupported',
          reason: 'physical',
          verb: { vi: 'ăn', en: 'eat' },
          object: { vi: 'chuối', en: 'a banana' },
          alternative: { type: 'jump', count: 1 },
        },
      ]),
      snap(),
    )
    expect(plannedReplies(p.steps)).toEqual([
      {
        key: 'unsupported',
        params: {
          reason: 'physical',
          verb: { vi: 'ăn', en: 'eat' },
          object: { vi: 'chuối', en: 'a banana' },
          alternative: 'jump',
        },
        seed: undefined,
      },
    ])
    expect(clips(p.steps)).toEqual(['No', 'Jump'])
    expect(p.needsBody).toBe(true)
  })

  it('nothing understood → confused head tilt + unknown with at most 3 suggestions', () => {
    const suggestions = ['nhảy lên', 'mấy giờ rồi?', 'bật đèn', 'xin chào'].map((say) => ({
      say,
      label: { vi: say, en: say },
    }))
    const p = plan(req([], { hasUnknown: true, suggestions }), snap())
    expect(plannedReplies(p.steps)).toEqual([
      { key: 'unknown', params: { suggestions: ['nhảy lên', 'mấy giờ rồi?', 'bật đèn'] }, seed: undefined },
    ])
    expect(flattenOps(p.steps)).toContain('head')
    expect(p.needsBody).toBe(false)
  })

  it('partly understood → the understood parts, then partial_unknown', () => {
    const p = plan(req([{ type: 'jump', count: 1 }], { hasUnknown: true }), snap())
    expect(keys(plannedReplies(p.steps))).toEqual(['motion.jump', 'partial_unknown'])
  })

  it('home: switches the lamp mid-nod, or says it is already on', () => {
    const on = plan(req([{ type: 'light', power: 'on' }]), snap())
    expect(ofOp(on.steps, 'room')[0]?.patch).toEqual({ light: { on: true } })
    expect(keys(plannedReplies(on.steps))).toEqual(['home.light_on'])

    const room = structuredClone(DEFAULT_ROOM)
    room.light.on = true
    const already = plan(req([{ type: 'light', power: 'on' }]), snap({ room }))
    expect(ofOp(already.steps, 'room')).toEqual([])
    expect(keys(plannedReplies(already.steps))).toEqual(['home.light_already'])
  })

  it('home: simulates the room across a chain ("bật đèn rồi tắt đèn")', () => {
    const p = plan(
      req([
        { type: 'light', power: 'on' },
        { type: 'light', power: 'off' },
      ]),
      snap(),
    )
    expect(keys(plannedReplies(p.steps))).toEqual(['home.light_on', 'home.light_off'])
  })

  it('home: the fan speed limit', () => {
    const room = structuredClone(DEFAULT_ROOM)
    room.fan = { on: true, speed: 3 }
    const p = plan(req([{ type: 'fan', speedDelta: 1 }]), snap({ room }))
    expect(keys(plannedReplies(p.steps))).toEqual(['home.fan_speed_limit'])
  })

  it('set_language / voice emit a pref step before their (blocking) reply', () => {
    const p = plan(req([{ type: 'set_language', lang: 'en' }]), snap())
    expect(p.steps.map((s) => s.op)).toEqual(['pref', 'say'])
    expect(p.steps[0]).toEqual({ op: 'pref', lang: 'en' })
    const v = plan(req([{ type: 'voice', on: false }]), snap())
    expect(v.steps[0]).toEqual({ op: 'pref', muted: true })
  })

  it('jokes rotate', () => {
    const p = plan(req([{ type: 'joke' }, { type: 'joke' }]), snap({ jokeIndex: 4 }))
    expect(plannedReplies(p.steps).map((r) => r.params)).toEqual([{ index: 4 }, { index: 5 }])
    expect(p.jokesUsed).toBe(2)
  })

  it('weather defaults to TP.HCM', () => {
    const p = plan(req([{ type: 'weather', place: null, dayOffset: 0, aspect: 'general' }]), snap())
    expect(ofOp(p.steps, 'weather')[0]?.place.id).toBe('HoChiMinh')
  })
})

describe('planner — special plans', () => {
  it('the alarm is assertive and beeps', () => {
    const p = planAlarm(snap(), ['nấu cơm'])
    expect(p.steps[0]).toEqual({
      op: 'say',
      reply: { key: 'timer.done', params: { label: 'nấu cơm' }, seed: undefined },
      wait: false,
      assertive: true,
    })
    expect(flattenOps(p.steps)).toContain('beep')
  })

  it('the welcome is silent and waves', () => {
    const p = planWelcome(snap(), 'side')
    expect(p.steps[0]).toMatchObject({
      op: 'say',
      silent: true,
      reply: { key: 'welcome', params: { layout: 'side' } },
    })
    expect(clips(p.steps)).toEqual(['Wave'])
  })
})

describe('planner — engine regressions', () => {
  const refusal: Action = {
    type: 'unsupported',
    reason: 'physical',
    verb: { vi: 'ăn', en: 'eat' },
    object: { vi: 'chuối', en: 'a banana' },
  }

  it('planner-seated-refusal: a seated robot shakes its head (procedural head op), no whole-body clip', () => {
    const p = plan(req([refusal]), snap({ posture: 'sitting' }))
    expect(clips(p.steps)).toEqual([])
    const yaws = ofOp(p.steps, 'head').flatMap((h) => (h.yaw === undefined ? [] : [h.yaw]))
    expect(yaws.some((y) => y > 0)).toBe(true)
    expect(yaws.some((y) => y < 0)).toBe(true)
    expect(yaws.at(-1)).toBe(0)
    expect(keys(plannedReplies(p.steps))).toEqual(['unsupported'])
    // Standing: still the No clip.
    expect(clips(plan(req([refusal]), snap()).steps)).toEqual(['No'])
  })

  it('planner-seated-swivel: a seated robot answers seated, without turning its body', () => {
    const sideways = { x: 0, z: 0, yaw: -Math.PI / 2 }
    for (const a of [{ type: 'time' }, { type: 'greet' }, refusal] as Action[]) {
      const p = plan(req([a]), snap({ posture: 'sitting', pose: sideways }))
      expect(ofOp(p.steps, 'turn')).toEqual([])
      expect(clips(p.steps)).not.toContain('Standing')
    }
    // Standing robots still turn to face the viewer.
    expect(ofOp(plan(req([{ type: 'time' }]), snap({ pose: sideways })).steps, 'turn')).toHaveLength(1)
  })

  it('planner-noop-reply-order: the "already sitting" reply comes before the ack of the rest of the chain', () => {
    const p = plan(
      req([{ type: 'sit' }, { type: 'walk', direction: 'forward', steps: 2 }]),
      snap({ posture: 'sitting' }),
    )
    expect(keys(plannedReplies(p.steps))).toEqual(['motion.already_sitting', 'motion.walk'])
    expect(clips(p.steps)).toEqual(['Standing'])
  })

  it('caps-note-wrong: every capped action is named with its own unit (counts cut by the parser)', () => {
    // "quay 9 vòng rồi nhảy 50 lần": the parser cut both counts and noted only the first cap.
    const p = plan(
      req(
        [
          { type: 'turn', direction: 'spin', count: 5 },
          { type: 'jump', count: 10 },
        ],
        { notes: [{ kind: 'capped', data: { max: 5 } }] },
      ),
      snap(),
    )
    expect(plannedReplies(p.steps)[0]).toEqual({
      key: 'note.capped',
      params: {
        max: 5,
        caps: [
          { action: 'turn', unit: 'spins', max: 5 },
          { action: 'jump', unit: 'times', max: 10 },
        ],
      },
      seed: undefined,
    })
  })

  it('caps-note-wrong: the note reads with the right units, in both languages', () => {
    const p = plan(
      req(
        [
          { type: 'turn', direction: 'spin', count: 5 },
          { type: 'jump', count: 10 },
        ],
        { notes: [{ kind: 'capped', data: { max: 5 } }] },
      ),
      snap(),
    )
    const note = plannedReplies(p.steps)[0]!
    expect(renderReply(note, 'vi').text).toBe('Mình xoay tối đa 5 vòng và nhảy tối đa 10 lần thôi nhé.')
    expect(renderReply(note, 'en').text).toBe("I'll do 5 spins and jump 10 times at most.")
    const walk = plannedReplies(
      plan(req([{ type: 'walk', direction: 'forward', steps: 20 }]), snap()).steps,
    )[0]!
    expect(renderReply(walk, 'vi').text).toBe('Mình đi tối đa 10 bước thôi nhé.')
    expect(renderReply(walk, 'en').text).toBe("I'll walk 10 steps at most.")
  })

  it('caps-note-wrong: steps are steps, seconds are seconds', () => {
    const walk = plan(
      req([{ type: 'walk', direction: 'forward', steps: 10 }], {
        notes: [{ kind: 'capped', data: { max: 10 } }],
      }),
      snap(),
    )
    expect(plannedReplies(walk.steps)[0]).toMatchObject({
      key: 'note.capped',
      params: { caps: [{ action: 'walk', unit: 'steps', max: 10 }] },
    })
    const dance = plan(req([{ type: 'dance', seconds: 90 }]), snap())
    expect(plannedReplies(dance.steps)[0]).toMatchObject({
      key: 'note.capped',
      params: { caps: [{ action: 'dance', unit: 'seconds', max: 60 }] },
    })
  })

  it('caps-note-wrong: reduced motion names the lower limit the robot really uses', () => {
    const p = plan(req([{ type: 'turn', direction: 'spin', count: 4 }]), snap({ reducedMotion: true }))
    expect(plannedReplies(p.steps)[0]).toMatchObject({
      key: 'note.capped',
      params: { max: 3, caps: [{ action: 'turn', unit: 'spins', max: 3 }] },
    })
    expect(ofOp(p.steps, 'turn')[0]?.extraTurns).toBe(3)
  })

  it('caps-note-wrong: a parser cap no single action shows (e.g. a repeated chain) keeps the generic note', () => {
    const p = plan(
      req(
        [
          { type: 'jump', count: 1 },
          { type: 'wave', count: 1 },
        ],
        { notes: [{ kind: 'capped', data: { max: 10 } }] },
      ),
      snap(),
    )
    expect(plannedReplies(p.steps)[0]).toEqual({ key: 'note.capped', params: { max: 10 }, seed: undefined })
  })

  it('engine-alarm-1: planAlarm announces every expired timer (soonest first) and beeps once', () => {
    const p = planAlarm(snap(), ['uống thuốc', undefined])
    expect(plannedReplies(p.steps)).toEqual([
      { key: 'timer.done', params: { label: 'uống thuốc' }, seed: undefined },
      { key: 'timer.done', params: {}, seed: undefined },
    ])
    expect(ofOp(p.steps, 'say').every((s) => s.assertive && !s.wait)).toBe(true)
    expect(flattenOps(p.steps).filter((o) => o === 'beep')).toHaveLength(1)
    expect(planAlarmNotice(snap(), ['tắt bếp']).steps.map((s) => s.op)).toEqual(['say', 'beep'])
  })

  it('engine-wait-holds-timer: splitForBody puts answers, timers and the room first, the motion later', () => {
    const parts = splitForBody(
      req(
        [
          { type: 'wave', count: 1 },
          { type: 'timer_start', seconds: 900, label: 'uống thuốc' },
          { type: 'light', power: 'on' },
        ],
        { notes: [{ kind: 'capped', data: { max: 10 } }], hasUnknown: true },
      ),
    )
    expect(parts?.now.actions.map((a) => a.type)).toEqual(['timer_start', 'light'])
    expect(parts?.now).toMatchObject({ hasUnknown: true, notes: [] })
    expect(parts?.later.actions.map((a) => a.type)).toEqual(['wave'])
    expect(parts?.later).toMatchObject({ hasUnknown: false, notes: [{ kind: 'capped' }] })
    // A refusal whose alternative is a motion waits with the motion.
    const alt = splitForBody(req([{ ...refusal, alternative: { type: 'jump', count: 1 } }, { type: 'time' }]))
    expect(alt?.later.actions.map((a) => a.type)).toEqual(['unsupported'])
    // Nothing to split: all motion, or no motion at all.
    expect(splitForBody(req([{ type: 'jump', count: 1 }]))).toBeNull()
    expect(splitForBody(req([{ type: 'time' }]))).toBeNull()
  })

  it('splitForBody keeps the LIMITS.maxActions cut and its note on the part that runs first', () => {
    const actions: Action[] = [
      ...Array.from({ length: 5 }, () => ({ type: 'nod', count: 1 }) as Action),
      { type: 'time' },
      { type: 'jump', count: 1 },
      { type: 'greet' },
    ]
    const parts = splitForBody(req(actions))!
    expect(parts.now.actions.map((a) => a.type)).toEqual(['time'])
    expect(parts.later.actions).toHaveLength(5)
    expect(keys(plannedReplies(plan(parts.now, snap()).steps))[0]).toBe('note.too_many_actions')
    expect(keys(plannedReplies(plan(parts.later, snap()).steps))).not.toContain('note.too_many_actions')
  })
})
