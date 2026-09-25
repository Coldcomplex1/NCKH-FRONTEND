import { FAN_POS, HOME } from '@/engine/spec'

/** Room box (metres). The robot's walkable area (engine WALK_BOUNDS) sits well inside it. */
export const ROOM = {
  minX: -3.4,
  maxX: 3.7,
  minZ: -2.7,
  maxZ: 2.75,
  height: 2.7,
  wall: 0.14,
} as const

/** Front face of the back wall. */
export const BACK_WALL_Z = ROOM.minZ

/** The fan is turned to face the robot's home spot. */
export const FAN_YAW = Math.atan2(HOME.x - FAN_POS.x, HOME.z - FAN_POS.z)
