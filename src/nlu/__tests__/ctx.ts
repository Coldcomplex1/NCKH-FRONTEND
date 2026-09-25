import type { Action } from '@/core/actions'
import type { ParseContext } from '@/core/parser'
import { DEFAULT_PLACE } from '@/core/places'
import { DEFAULT_ROOM } from '@/core/room'
import type { Activity, Posture } from '@/core/robot'

/** Spec §10 context C0: Thursday 2026-09-24 08:35 in Vietnam, robot standing idle, room off. */
export interface CtxPatch {
  posture?: Posture
  activity?: Activity
  lightOn?: boolean
  fanOn?: boolean
  last?: Action[]
  timers?: ParseContext['timers']
}

export function makeCtx(p: CtxPatch = {}): ParseContext {
  return {
    now: new Date('2026-09-24T08:35:00+07:00'),
    lang: 'vi',
    robot: { posture: p.posture ?? 'standing', activity: p.activity ?? 'idle' },
    room: {
      light: { ...DEFAULT_ROOM.light, on: p.lightOn ?? false },
      fan: { ...DEFAULT_ROOM.fan, on: p.fanOn ?? false },
    },
    lastActions: p.last ?? [],
    timers: p.timers ?? [],
    defaultPlace: DEFAULT_PLACE,
  }
}
