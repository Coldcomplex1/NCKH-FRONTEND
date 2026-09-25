import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { DoubleSide, type Group, type MeshBasicMaterial } from 'three'
import { vnParts } from '@/lib/vnTime'
import { BACK_WALL_Z, ROOM } from './layout'
import type { ScenePalette } from './palette'
import { StaticInstances, type InstanceSpec } from './StaticInstances'
import { plankTexture, radialTexture } from './textures'

const W = ROOM.maxX - ROOM.minX
const D = ROOM.maxZ - ROOM.minZ
const CX = (ROOM.minX + ROOM.maxX) / 2
const CZ = (ROOM.minZ + ROOM.maxZ) / 2

const SHELF = { x: -1.15, y: 1.28 } as const
const CLOCK = { x: -1.15, y: 2.02 } as const
const WINDOW = { x: 1.25, y: 1.62, w: 1.1, h: 0.95 } as const
const PLANT = { x: -1.8, z: -2.3 } as const

type SkyPhase = 'day' | 'dusk' | 'night'
const SKY: Record<SkyPhase, string> = { day: '#BFE6FF', dusk: '#FFB38A', night: '#1B2A4A' }

function skyPhase(hour: number): SkyPhase {
  if (hour >= 6 && hour < 17) return 'day'
  if (hour >= 17 && hour < 19) return 'dusk'
  if (hour === 5) return 'dusk'
  return 'night'
}

export function Room({ palette }: { palette: ScenePalette }) {
  const planks = useMemo(() => plankTexture(), [])
  return (
    <group>
      <KeyLight palette={palette} />
      {/* Floor slab (diorama base) + plank top */}
      <mesh position={[CX, -0.09, CZ]}>
        <boxGeometry args={[W, 0.18, D]} />
        <meshStandardMaterial color={palette.floorEdge} roughness={0.9} />
      </mesh>
      <mesh position={[CX, 0.001, CZ]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color={palette.floor} map={planks} roughness={0.85} />
      </mesh>

      {/* Back wall + wainscot + rail */}
      <mesh position={[CX, ROOM.height / 2, ROOM.minZ - ROOM.wall / 2]}>
        <boxGeometry args={[W + ROOM.wall, ROOM.height, ROOM.wall]} />
        <meshStandardMaterial color={palette.backWall} roughness={0.95} />
      </mesh>
      <mesh position={[CX, 0.42, ROOM.minZ + 0.01]}>
        <boxGeometry args={[W, 0.84, 0.02]} />
        <meshStandardMaterial color={palette.wainscot} roughness={0.95} />
      </mesh>
      <mesh position={[CX, 0.86, ROOM.minZ + 0.025]}>
        <boxGeometry args={[W, 0.05, 0.05]} />
        <meshStandardMaterial color={palette.trim} roughness={0.7} />
      </mesh>

      {/* Left wall + wainscot + rail */}
      <mesh position={[ROOM.minX - ROOM.wall / 2, ROOM.height / 2, CZ - ROOM.wall / 2]}>
        <boxGeometry args={[ROOM.wall, ROOM.height, D + ROOM.wall]} />
        <meshStandardMaterial color={palette.leftWall} roughness={0.95} />
      </mesh>
      <mesh position={[ROOM.minX + 0.01, 0.42, CZ]}>
        <boxGeometry args={[0.02, 0.84, D]} />
        <meshStandardMaterial color={palette.wainscot} roughness={0.95} />
      </mesh>
      <mesh position={[ROOM.minX + 0.025, 0.86, CZ]}>
        <boxGeometry args={[0.05, 0.05, D]} />
        <meshStandardMaterial color={palette.trim} roughness={0.7} />
      </mesh>

      <Rug palette={palette} />
      <Shelf palette={palette} />
      <WallClock palette={palette} />
      <Window palette={palette} />
      <Plant palette={palette} />
    </group>
  )
}

/** Soft key light from the front-right (no shadow maps: the robot gets a blob shadow). */
function KeyLight({ palette }: { palette: ScenePalette }) {
  return (
    <>
      <directionalLight position={[3.5, 6, 5]} intensity={palette.keyIntensity} color={palette.keyColor} />
      <directionalLight position={[-4, 3, 2]} intensity={palette.keyIntensity * 0.25} color="#FFE9F2" />
    </>
  )
}

function Rug({ palette }: { palette: ScenePalette }) {
  const dots = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i): InstanceSpec => {
        const a = (i / 14) * Math.PI * 2
        return { position: [Math.cos(a) * 1.18, 0.024, Math.sin(a) * 1.18], rotation: [-Math.PI / 2, 0, 0] }
      }),
    [],
  )
  return (
    <group position={[0, 0, 0.15]}>
      <mesh position={[0, 0.008, 0]}>
        <cylinderGeometry args={[1.5, 1.5, 0.012, 64]} />
        <meshStandardMaterial color={palette.rugBorder} roughness={1} />
      </mesh>
      <mesh position={[0, 0.016, 0]}>
        <cylinderGeometry args={[1.36, 1.36, 0.012, 64]} />
        <meshStandardMaterial color={palette.rug} roughness={1} />
      </mesh>
      <StaticInstances items={dots}>
        <circleGeometry args={[0.06, 16]} />
        <meshStandardMaterial color={palette.rugDots} roughness={1} />
      </StaticInstances>
    </group>
  )
}

function Shelf({ palette }: { palette: ScenePalette }) {
  const books = useMemo(() => {
    const sizes = [
      { w: 0.09, h: 0.3, tilt: 0 },
      { w: 0.07, h: 0.26, tilt: 0 },
      { w: 0.1, h: 0.34, tilt: 0 },
      { w: 0.08, h: 0.28, tilt: 0 },
      { w: 0.07, h: 0.24, tilt: -0.28 },
    ]
    let x = -0.5
    return sizes.map((b, i): InstanceSpec => {
      const cx = x + b.w / 2 + (b.tilt ? 0.04 : 0)
      x += b.w + 0.012
      return {
        position: [cx, 0.025 + b.h / 2, 0],
        rotation: [0, 0, b.tilt],
        scale: [b.w, b.h, 0.2],
        color: palette.books[i % palette.books.length],
      }
    })
  }, [palette.books])
  const brackets = useMemo<InstanceSpec[]>(
    () => [-0.5, 0.5].map((bx) => ({ position: [bx, -0.09, -0.1], scale: [0.04, 0.14, 0.08] })),
    [],
  )
  return (
    <group position={[SHELF.x, SHELF.y, BACK_WALL_Z + 0.16]}>
      <mesh>
        <boxGeometry args={[1.25, 0.05, 0.3]} />
        <meshStandardMaterial color={palette.shelf} roughness={0.6} />
      </mesh>
      <StaticInstances items={brackets}>
        <boxGeometry />
        <meshStandardMaterial color={palette.shelf} roughness={0.6} />
      </StaticInstances>
      <StaticInstances items={books}>
        <boxGeometry />
        <meshStandardMaterial color="#FFFFFF" roughness={0.8} />
      </StaticInstances>
      {/* a little succulent at the other end */}
      <group position={[0.38, 0.025, 0]}>
        <mesh position={[0, 0.07, 0]}>
          <cylinderGeometry args={[0.08, 0.065, 0.14, 20]} />
          <meshStandardMaterial color={palette.books[3]} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.18, 0]} scale={[1, 0.8, 1]}>
          <sphereGeometry args={[0.09, 20, 14]} />
          <meshStandardMaterial color={palette.leaf} roughness={0.8} />
        </mesh>
      </group>
      {/* a ball toy */}
      <mesh position={[0.18, 0.1, 0.02]}>
        <sphereGeometry args={[0.075, 20, 14]} />
        <meshStandardMaterial color={palette.clockSecond} roughness={0.5} />
      </mesh>
    </group>
  )
}

/** Wall clock whose hands show the current time in Vietnam (vnParts, never getHours). */
function WallClock({ palette }: { palette: ScenePalette }) {
  const hour = useRef<Group>(null)
  const minute = useRef<Group>(null)
  const second = useRef<Group>(null)
  const lastSec = useRef(-1)
  useFrame(() => {
    const now = Date.now()
    const s = Math.floor(now / 1000)
    if (s === lastSec.current) return
    lastSec.current = s
    const p = vnParts(new Date(now))
    const TAU = Math.PI * 2
    if (hour.current) hour.current.rotation.z = -(((p.hour % 12) + p.minute / 60) / 12) * TAU
    if (minute.current) minute.current.rotation.z = -((p.minute + p.second / 60) / 60) * TAU
    if (second.current) second.current.rotation.z = -(p.second / 60) * TAU
  })
  const ticks = useMemo(
    () =>
      [0, 1, 2, 3].map((i): InstanceSpec => {
        const a = (i / 4) * Math.PI * 2
        return { position: [Math.sin(a) * 0.2, Math.cos(a) * 0.2, 0.066] }
      }),
    [],
  )
  return (
    <group position={[CLOCK.x, CLOCK.y, BACK_WALL_Z + 0.02]}>
      <mesh rotation-x={Math.PI / 2} position={[0, 0, 0.03]}>
        <cylinderGeometry args={[0.3, 0.3, 0.06, 40]} />
        <meshStandardMaterial color={palette.clockRim} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.062]}>
        <circleGeometry args={[0.25, 40]} />
        <meshStandardMaterial color={palette.clockFace} roughness={0.6} />
      </mesh>
      <StaticInstances items={ticks}>
        <circleGeometry args={[0.022, 12]} />
        <meshStandardMaterial color={palette.clockRim} />
      </StaticInstances>
      <group ref={hour} position={[0, 0, 0.07]}>
        <mesh position={[0, 0.065, 0]}>
          <boxGeometry args={[0.03, 0.15, 0.012]} />
          <meshStandardMaterial color={palette.clockHand} />
        </mesh>
      </group>
      <group ref={minute} position={[0, 0, 0.08]}>
        <mesh position={[0, 0.09, 0]}>
          <boxGeometry args={[0.02, 0.2, 0.01]} />
          <meshStandardMaterial color={palette.clockHand} />
        </mesh>
      </group>
      <group ref={second} position={[0, 0, 0.09]}>
        <mesh position={[0, 0.085, 0]}>
          <boxGeometry args={[0.008, 0.21, 0.006]} />
          <meshStandardMaterial color={palette.clockSecond} />
        </mesh>
      </group>
      <mesh position={[0, 0, 0.096]}>
        <circleGeometry args={[0.025, 16]} />
        <meshStandardMaterial color={palette.clockSecond} />
      </mesh>
    </group>
  )
}

const CLOUD_PUFFS: readonly InstanceSpec[] = [
  [0, 0, 0.12],
  [0.13, 0.03, 0.1],
  [-0.12, -0.01, 0.085],
  [0.24, -0.02, 0.07],
].map(([x, y, r]) => ({ position: [x!, y!, 0], scale: r! }))

const WINDOW_FRAME: readonly InstanceSpec[] = (() => {
  const { w, h } = WINDOW
  const bar = 0.07
  const bars: [number, number, number, number][] = [
    [0, h / 2 + bar / 2, w + bar * 2, bar],
    [0, -h / 2 - bar / 2, w + bar * 2, bar],
    [-w / 2 - bar / 2, 0, bar, h],
    [w / 2 + bar / 2, 0, bar, h],
    [0, 0, bar * 0.6, h],
    [0, 0, w, bar * 0.6],
  ]
  return [
    ...bars.map(([x, y, bw, bh]): InstanceSpec => ({ position: [x, y, 0.03], scale: [bw, bh, 0.05] })),
    // sill
    { position: [0, -h / 2 - bar - 0.02, 0.07], scale: [w + 0.3, 0.05, 0.16] },
  ]
})()

/** Window with a sky that follows the hour in Vietnam (day / dusk / night), a cloud or a moon. */
function Window({ palette }: { palette: ScenePalette }) {
  const sky = useRef<MeshBasicMaterial>(null)
  const cloud = useRef<Group>(null)
  const moon = useRef<Group>(null)
  const lastCheck = useRef(-Infinity)
  useFrame(() => {
    const now = Date.now()
    if (now - lastCheck.current < 30_000) return
    lastCheck.current = now
    const phase = skyPhase(vnParts(new Date(now)).hour)
    sky.current?.color.set(SKY[phase])
    if (cloud.current) cloud.current.visible = phase !== 'night'
    if (moon.current) moon.current.visible = phase === 'night'
  })
  const z = BACK_WALL_Z + 0.02
  return (
    <group position={[WINDOW.x, WINDOW.y, z]}>
      <mesh position={[0, 0, 0.005]}>
        <planeGeometry args={[WINDOW.w, WINDOW.h]} />
        <meshBasicMaterial ref={sky} color={SKY.day} toneMapped={false} />
      </mesh>
      <group ref={cloud} position={[-0.18, 0.14, 0.012]}>
        <StaticInstances items={CLOUD_PUFFS}>
          <circleGeometry args={[1, 20]} />
          <meshBasicMaterial color="#FFFFFF" toneMapped={false} />
        </StaticInstances>
      </group>
      <group ref={moon} position={[0.24, 0.2, 0.012]} visible={false}>
        <mesh>
          <circleGeometry args={[0.1, 24]} />
          <meshBasicMaterial color="#FFF3C4" toneMapped={false} />
        </mesh>
      </group>
      {/* frame: 4 sides + cross bars + sill */}
      <StaticInstances items={WINDOW_FRAME}>
        <boxGeometry />
        <meshStandardMaterial color={palette.frame} roughness={0.6} />
      </StaticInstances>
    </group>
  )
}

function Plant({ palette }: { palette: ScenePalette }) {
  const shadow = useMemo(() => radialTexture(), [])
  const leaves = useMemo(
    () =>
      [0, 1, 2, 3, 4, 5].map((i): InstanceSpec => {
        // Same as a group turned by `a` holding a leaf tilted outward by `tilt`.
        const a = (i / 6) * Math.PI * 2
        const tilt = 0.55 + (i % 2) * 0.2
        const h = 0.42 + (i % 3) * 0.08
        return {
          position: [0.1 * Math.sin(a), 0.42 + h / 2, 0.1 * Math.cos(a)],
          rotation: [tilt, a, 0],
          order: 'YXZ',
          scale: [0.12, h / 2, 0.035],
          color: i % 2 ? palette.leafDark : palette.leaf,
        }
      }),
    [palette.leaf, palette.leafDark],
  )
  return (
    <group position={[PLANT.x, 0, PLANT.z]}>
      <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.9, 0.9]} />
        <meshBasicMaterial
          map={shadow}
          color={palette.shadow}
          transparent
          opacity={palette.shadowOpacity}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.24, 0.18, 0.4, 28]} />
        <meshStandardMaterial color={palette.pot} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.41, 0]}>
        <cylinderGeometry args={[0.26, 0.26, 0.05, 28]} />
        <meshStandardMaterial color={palette.pot} roughness={0.7} />
      </mesh>
      <StaticInstances items={leaves}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.8} side={DoubleSide} />
      </StaticInstances>
    </group>
  )
}
