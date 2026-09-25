import type { ColorId } from './colors'

export type FanSpeed = 1 | 2 | 3

/** Semantic state of the robot's virtual room (the simulated smart home). */
export interface RoomState {
  light: { on: boolean; color: ColorId; /** true while the robot sleeps */ dimmed: boolean }
  fan: { on: boolean; speed: FanSpeed }
}

/** Light starts OFF so the first "bật đèn" visibly works. */
export const DEFAULT_ROOM: RoomState = {
  light: { on: false, color: 'warm', dimmed: false },
  fan: { on: false, speed: 2 },
}
