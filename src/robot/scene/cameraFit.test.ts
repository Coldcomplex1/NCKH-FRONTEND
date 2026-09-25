import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { TO_USER, WALK_BOUNDS } from '@/engine/spec'
import {
  CAMERA_FOV,
  DISTANCE_RANGE,
  KEY_POINTS,
  VIEW_DIR,
  fitCamera,
  fitDistance,
  followTarget,
  homeTarget,
  projectNdc,
  robotViewFraction,
} from './cameraFit'

describe('cameraFit', () => {
  it('matches three.js projection', () => {
    const aspect = 1.2
    const d = 6
    const target = homeTarget()
    const cam = new PerspectiveCamera(CAMERA_FOV, aspect, 0.1, 50)
    cam.position.set(...target).addScaledVector(new Vector3(...VIEW_DIR), d)
    cam.lookAt(new Vector3(...target))
    cam.updateMatrixWorld()
    for (const p of KEY_POINTS) {
      const v = new Vector3(...p).project(cam)
      const n = projectNdc(p, target, d, aspect)
      expect(n.x).toBeCloseTo(v.x, 6)
      expect(n.y).toBeCloseTo(v.y, 6)
    }
  })

  it('fits robot, lamp and fan for desktop and phone aspects, robot large', () => {
    for (const aspect of [0.75, 1, 1.3, 1.7]) {
      const { distance: d, biasX } = fitCamera(aspect)
      expect(d).toBeGreaterThanOrEqual(DISTANCE_RANGE.min)
      expect(d).toBeLessThanOrEqual(DISTANCE_RANGE.max)
      for (const p of KEY_POINTS) {
        const n = projectNdc(p, homeTarget(biasX), d, aspect)
        expect(Math.abs(n.x)).toBeLessThanOrEqual(0.98)
        expect(Math.abs(n.y)).toBeLessThanOrEqual(0.91)
      }
    }
    // Square-ish panels (desktop left panel, stacked phone) show the robot at a good size.
    expect(robotViewFraction(fitDistance(1))).toBeGreaterThan(0.36)
    expect(robotViewFraction(fitDistance(1.3))).toBeGreaterThan(0.44)
  })

  it('is monotonic: narrower canvases pull the camera back', () => {
    expect(fitDistance(0.8)).toBeGreaterThan(fitDistance(1))
    expect(fitDistance(1)).toBeGreaterThan(fitDistance(1.3))
    expect(fitDistance(Number.NaN)).toBe(fitDistance(1))
  })

  it('keeps the whole robot in frame at the edges of the walkable area while following', () => {
    for (const aspect of [0.75, 0.95, 1, 1.3]) {
      const { distance: d, biasX } = fitCamera(aspect)
      const spots = [
        { x: WALK_BOUNDS.minX, z: 0 },
        { x: WALK_BOUNDS.maxX, z: 0 },
        { x: WALK_BOUNDS.minX, z: WALK_BOUNDS.maxZ },
        { x: WALK_BOUNDS.maxX, z: WALK_BOUNDS.minZ },
        TO_USER,
        { x: 0, z: WALK_BOUNDS.maxZ },
      ]
      for (const s of spots) {
        const t = followTarget(s, biasX)
        // shoulders/arms (±0.45 m), feet and head
        for (const [dx, y] of [
          [-0.45, 0.9],
          [0.45, 0.9],
          [0, 0],
          [0, 1.6],
        ] as const) {
          const n = projectNdc([s.x + dx, y, s.z], t, d, aspect)
          expect(Math.abs(n.x)).toBeLessThan(0.95)
          expect(Math.abs(n.y)).toBeLessThan(0.95)
        }
      }
    }
  })
})
