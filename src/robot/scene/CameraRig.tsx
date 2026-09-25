import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type ComponentRef, type RefObject } from 'react'
import { Vector3, type Camera, type Object3D } from 'three'
import { HOME } from '@/engine/spec'
import { damp } from '../model/math'
import { VIEW_DIR, fitCamera, followTarget } from './cameraFit'

/** How fast the camera target follows the robot (1/s). */
const FOLLOW_LAMBDA = 2.5
const DIST_LAMBDA = 3

/**
 * Frames the diorama for the canvas aspect and gently follows the robot. OrbitControls are mounted
 * only for mouse-only devices (on touch they would set `touch-action: none` and block page scroll);
 * zoom and pan are always off, angles are clamped, and there is an explicit "reset view".
 */
export function CameraRig({
  target,
  reducedMotion,
  orbit,
  resetKey,
}: {
  target: RefObject<Object3D | null>
  reducedMotion: boolean
  orbit: boolean
  resetKey: number
}) {
  const size = useThree((s) => s.size)
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const dragging = useRef(false)
  const aspect = size.width / Math.max(1, size.height)
  const fit = useMemo(() => fitCamera(aspect), [aspect])

  const tgt = useRef(new Vector3())
  const dist = useRef(fit.distance)
  const primed = useRef(false)
  const offset = useMemo(() => new Vector3(), [])
  const defaultDir = useMemo(() => new Vector3(VIEW_DIR[0], VIEW_DIR[1], VIEW_DIR[2]), [])

  const place = (camera: Camera, dir: Vector3 | null) => {
    const c = controls.current
    if (dir) offset.copy(dir)
    else if (c) offset.copy(camera.position).sub(c.target)
    else offset.set(VIEW_DIR[0], VIEW_DIR[1], VIEW_DIR[2])
    if (offset.lengthSq() < 1e-8) offset.set(VIEW_DIR[0], VIEW_DIR[1], VIEW_DIR[2])
    offset.setLength(dist.current)
    camera.position.copy(tgt.current).add(offset)
    if (c) c.target.copy(tgt.current)
    camera.lookAt(tgt.current)
  }

  // "Reset view": handled on the next frame (default direction, re-fit, snap to the robot).
  const pendingReset = useRef(false)
  useEffect(() => {
    if (resetKey !== 0) pendingReset.current = true
  }, [resetKey])

  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const r = target.current
    const [gx, gy, gz] = followTarget(r ? { x: r.position.x, z: r.position.z } : HOME, fit.biasX)
    const reset = pendingReset.current
    pendingReset.current = false
    const snap = reducedMotion || !primed.current || reset
    if (snap) {
      tgt.current.set(gx, gy, gz)
      dist.current = fit.distance
    } else {
      if (!dragging.current) {
        tgt.current.x = damp(tgt.current.x, gx, FOLLOW_LAMBDA, dt)
        tgt.current.y = damp(tgt.current.y, gy, FOLLOW_LAMBDA, dt)
        tgt.current.z = damp(tgt.current.z, gz, FOLLOW_LAMBDA, dt)
      }
      dist.current = damp(dist.current, fit.distance, DIST_LAMBDA, dt)
    }
    place(camera, primed.current && !reset ? null : defaultDir)
    if (reset) controls.current?.update()
    primed.current = true
  })

  if (!orbit) return null
  return (
    <OrbitControls
      ref={controls}
      enableZoom={false}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.6}
      minPolarAngle={0.95}
      maxPolarAngle={1.45}
      minAzimuthAngle={-0.35}
      maxAzimuthAngle={1.1}
      onStart={() => (dragging.current = true)}
      onEnd={() => (dragging.current = false)}
    />
  )
}
