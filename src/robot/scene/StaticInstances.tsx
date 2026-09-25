import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { Color, Matrix4, type InstancedMesh } from 'three'
import { composeInstance, type InstanceSpec } from './instances'

export type { InstanceSpec } from './instances'

const m = new Matrix4()
const c = new Color()

/**
 * Many copies of one geometry + material in a single draw call (rug dots, books, leaves, blades…).
 * The items are static: pass a memoized array; a new array rewrites the matrices and colours.
 */
export function StaticInstances({
  items,
  children,
  renderOrder,
}: {
  items: readonly InstanceSpec[]
  /** The geometry and the material. */
  children: ReactNode
  renderOrder?: number
}) {
  const ref = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    items.forEach((it, i) => {
      mesh.setMatrixAt(i, composeInstance(it, m))
      if (it.color) mesh.setColorAt(i, c.set(it.color))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    // Culling uses the instances' bounds (computed from the matrices just written).
    mesh.computeBoundingSphere()
  }, [items])

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} renderOrder={renderOrder}>
      {children}
    </instancedMesh>
  )
}
