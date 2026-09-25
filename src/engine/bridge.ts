import type { AnimationController } from './types'

/**
 * The only link between the 3D scene (src/robot, lazy chunk) and the engine (main chunk).
 * The scene attaches its AnimationController when the robot model is ready and detaches on unmount;
 * the engine subscribes to learn when a body is available (and to show the welcome bubble).
 * No three.js here, so importing it never pulls three into the main chunk.
 */
type Listener = (ctrl: AnimationController | null) => void

let current: AnimationController | null = null
const listeners = new Set<Listener>()

export const controllerBridge = {
  /** Idempotent (StrictMode mounts effects twice). */
  attach(ctrl: AnimationController): void {
    if (current === ctrl) return
    current = ctrl
    listeners.forEach((l) => l(ctrl))
  },
  /** Only detaches if `ctrl` is the attached one. */
  detach(ctrl: AnimationController): void {
    if (current !== ctrl) return
    current = null
    listeners.forEach((l) => l(null))
  },
  get(): AnimationController | null {
    return current
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}
