import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type RefObject } from 'react'
import { Vector3, type Mesh, type Object3D } from 'three'
import type { ScenePalette } from './palette'
import { radialTexture } from './textures'

const SIZE = 1.25

/**
 * Soft round shadow under the robot (no shadow maps). Follows the robot's outer group on x/z; it
 * shrinks and fades a little when the hips rise (jumps).
 */
export function BlobShadow({
  target,
  body,
  palette,
}: {
  target: RefObject<Object3D | null>
  /** The hips bone (world height tells how high the robot jumps). */
  body: Object3D | null
  palette: ScenePalette
}) {
  const mesh = useRef<Mesh>(null)
  const tex = useMemo(() => radialTexture(), [])
  const rest = useRef<number | null>(null)
  const tmp = useMemo(() => new Vector3(), [])

  useFrame(() => {
    const m = mesh.current
    const t = target.current
    if (!m || !t) return
    m.position.x = t.position.x
    m.position.z = t.position.z
    let lift = 0
    const b = body
    if (b) {
      const y = b.getWorldPosition(tmp).y - t.position.y
      if (rest.current === null) rest.current = y
      lift = Math.max(0, y - rest.current)
    }
    // 0–1 "jump" amount (metres of hip lift).
    const k = Math.min(1, lift / 0.35)
    const s = SIZE * (1 - 0.3 * k)
    m.scale.set(s, s, 1)
    const mat = m.material as { opacity: number }
    mat.opacity = palette.shadowOpacity * 1.35 * (1 - 0.4 * k)
  })

  return (
    <mesh ref={mesh} position={[0, 0.03, 0]} rotation-x={-Math.PI / 2} renderOrder={1}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={tex}
        color={palette.shadow}
        transparent
        opacity={palette.shadowOpacity * 1.35}
        depthWrite={false}
      />
    </mesh>
  )
}
