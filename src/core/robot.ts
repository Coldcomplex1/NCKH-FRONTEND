/** Semantic (not per-frame) robot state, shared by parser context, engine and UI. */
export type Posture = 'standing' | 'sitting' | 'sleeping' | 'lying'
export type Activity = 'idle' | 'walking' | 'running' | 'dancing'
/** Morph targets that exist on RobotExpressive.glb. There is no smile target. */
export type Expression = 'Angry' | 'Surprised' | 'Sad'

export interface RobotSemanticState {
  posture: Posture
  activity: Activity
  expression: Expression | null
}

export const DEFAULT_ROBOT: RobotSemanticState = { posture: 'standing', activity: 'idle', expression: null }
