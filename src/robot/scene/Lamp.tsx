import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  type HemisphereLight,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
  type PointLight,
} from 'three'
import { LIGHT_COLORS } from '@/core/colors'
import { LAMP_POS } from '@/engine/spec'
import { useDemo } from '@/store/demoStore'
import { dampFactor } from '../model/math'
import type { ScenePalette } from './palette'
import { BACK_WALL_Z } from './layout'
import { radialTexture } from './textures'

/** Transition time constant: ≈ 0.4 s to settle. */
const TAU_S = 0.12
const POINT_MAX = 9
const BULB_MAX = 3.2
const DIMMED = 0.3

const POLE_H = 1.46
const SHADE_Y = 1.6
const BULB_Y = 1.52

/**
 * Floor lamp at LAMP_POS, driven by the room light state. When it is on, five things change together
 * (bulb, shade glow, point light, floor/wall glow, room tint) so the switch is obvious. The light
 * count never changes: only intensities and colours are animated (no shader recompiles).
 */
export function Lamp({ palette }: { palette: ScenePalette }) {
  const light = useDemo((s) => s.room.light)
  const glow = useMemo(() => radialTexture(), [])

  const bulb = useRef<MeshStandardMaterial>(null)
  const shade = useRef<MeshStandardMaterial>(null)
  const point = useRef<PointLight>(null)
  const floorGlow = useRef<MeshBasicMaterial>(null)
  const wallGlow = useRef<MeshBasicMaterial>(null)
  const hemi = useRef<HemisphereLight>(null)

  const level = useRef(0)
  const color = useRef(new Color(LIGHT_COLORS[light.color].hex))
  const target = useRef(new Color())
  const tint = useRef(new Color())

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const goal = light.on ? (light.dimmed ? DIMMED : 1) : 0
    const k = dampFactor(1 / TAU_S, dt)
    level.current += (goal - level.current) * k
    if (Math.abs(goal - level.current) < 1e-4) level.current = goal
    target.current.set(LIGHT_COLORS[light.color].hex)
    color.current.lerp(target.current, dampFactor(1 / 0.18, dt))
    const l = level.current
    const c = color.current

    if (bulb.current) {
      bulb.current.emissive.copy(c)
      bulb.current.emissiveIntensity = BULB_MAX * l
      bulb.current.color.set(palette.bulbOff).lerp(c, l)
    }
    if (shade.current) {
      shade.current.emissive.copy(c)
      shade.current.emissiveIntensity = 0.55 * l
    }
    if (point.current) {
      point.current.color.copy(c)
      point.current.intensity = POINT_MAX * l
    }
    if (floorGlow.current) {
      floorGlow.current.color.copy(c)
      floorGlow.current.opacity = 0.4 * l
    }
    if (wallGlow.current) {
      wallGlow.current.color.copy(c)
      wallGlow.current.opacity = 0.3 * l
    }
    if (hemi.current) {
      hemi.current.intensity = palette.hemiIntensity + palette.lampBoost * l
      tint.current.set(palette.hemiSky).lerp(c, 0.25 * l)
      hemi.current.color.copy(tint.current)
    }
  })

  return (
    <>
      <hemisphereLight
        ref={hemi}
        color={palette.hemiSky}
        groundColor={palette.hemiGround}
        intensity={palette.hemiIntensity}
      />
      <group position={[LAMP_POS.x, 0, LAMP_POS.z]}>
        {/* soft contact shadow */}
        <mesh position={[0, 0.012, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.8, 0.8]} />
          <meshBasicMaterial
            map={glow}
            color={palette.shadow}
            transparent
            opacity={palette.shadowOpacity}
            depthWrite={false}
          />
        </mesh>
        {/* floor glow */}
        <mesh position={[0.25, 0.02, 0.35]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[2.8, 2.8]} />
          <meshBasicMaterial
            ref={floorGlow}
            map={glow}
            transparent
            opacity={0}
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        {/* base, pole */}
        <mesh position={[0, 0.03, 0]}>
          <cylinderGeometry args={[0.2, 0.24, 0.06, 32]} />
          <meshStandardMaterial color={palette.lampMetal} roughness={0.45} metalness={0.2} />
        </mesh>
        <mesh position={[0, POLE_H / 2 + 0.05, 0]}>
          <cylinderGeometry args={[0.022, 0.022, POLE_H, 12]} />
          <meshStandardMaterial color={palette.lampMetal} roughness={0.45} metalness={0.2} />
        </mesh>
        {/* shade (open cone) */}
        <mesh position={[0, SHADE_Y, 0]}>
          <cylinderGeometry args={[0.17, 0.32, 0.36, 32, 1, true]} />
          <meshStandardMaterial
            ref={shade}
            color={palette.lampShade}
            emissive={palette.lampShade}
            emissiveIntensity={0}
            roughness={0.9}
            side={DoubleSide}
          />
        </mesh>
        <mesh position={[0, SHADE_Y - 0.18, 0]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.32, 0.014, 8, 40]} />
          <meshStandardMaterial color={palette.lampMetal} roughness={0.5} />
        </mesh>
        {/* bulb */}
        <mesh position={[0, BULB_Y, 0]}>
          <sphereGeometry args={[0.085, 24, 16]} />
          <meshStandardMaterial
            ref={bulb}
            color={palette.bulbOff}
            emissive="#000000"
            emissiveIntensity={0}
            roughness={0.3}
            toneMapped={false}
          />
        </mesh>
        <pointLight ref={point} position={[0.1, BULB_Y - 0.08, 0.2]} intensity={0} distance={8} decay={2} />
      </group>
      {/* glow on the wall behind the lamp */}
      <mesh position={[LAMP_POS.x + 0.1, SHADE_Y, BACK_WALL_Z + 0.03]}>
        <planeGeometry args={[2, 2]} />
        <meshBasicMaterial
          ref={wallGlow}
          map={glow}
          transparent
          opacity={0}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </>
  )
}
