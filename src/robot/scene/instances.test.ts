import { Matrix4, Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import { composeInstance } from './instances'

/** Nested groups (as in the old JSX) vs one instance matrix: the elements must match. */
function nested(build: (outer: Object3D, inner: Object3D) => void): Matrix4 {
  const outer = new Object3D()
  const inner = new Object3D()
  outer.add(inner)
  build(outer, inner)
  outer.updateMatrixWorld(true)
  return inner.matrixWorld
}

const maxDiff = (a: Matrix4, b: Matrix4) =>
  Math.max(...a.elements.map((v, i) => Math.abs(v - b.elements[i]!)))

describe('composeInstance', () => {
  it("'YXZ' = a group turned by yaw holding a tilted leaf", () => {
    const a = 2.1
    const tilt = 0.6
    const h = 0.5
    const ref = nested((outer, leaf) => {
      outer.position.set(0, 0.42, 0)
      outer.rotation.y = a
      leaf.position.set(0, h / 2, 0.1)
      leaf.rotation.x = tilt
      leaf.scale.set(0.12, h / 2, 0.035)
    })
    const m = composeInstance(
      {
        position: [0.1 * Math.sin(a), 0.42 + h / 2, 0.1 * Math.cos(a)],
        rotation: [tilt, a, 0],
        order: 'YXZ',
        scale: [0.12, h / 2, 0.035],
      },
      new Matrix4(),
    )
    expect(maxDiff(m, ref)).toBeLessThan(1e-9)
  })

  it("'ZYX' = a blade arm turned about the hub holding a pitched blade", () => {
    const t = (2 / 3) * Math.PI * 2
    const ref = nested((arm, blade) => {
      arm.rotation.z = t
      blade.position.set(0, 0.165, 0)
      blade.rotation.y = 0.35
      blade.scale.set(0.085, 0.15, 0.012)
    })
    const m = composeInstance(
      {
        position: [-0.165 * Math.sin(t), 0.165 * Math.cos(t), 0],
        rotation: [0, 0.35, t],
        order: 'ZYX',
        scale: [0.085, 0.15, 0.012],
      },
      new Matrix4(),
    )
    expect(maxDiff(m, ref)).toBeLessThan(1e-9)
  })

  it('accepts a uniform scale', () => {
    const m = composeInstance({ position: [1, 2, 3], scale: 0.5 }, new Matrix4())
    expect(m.elements[0]).toBeCloseTo(0.5)
    expect(m.elements[12]).toBe(1)
  })
})
