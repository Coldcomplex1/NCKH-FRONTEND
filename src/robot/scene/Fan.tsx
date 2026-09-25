import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { DoubleSide, type Group, type MeshStandardMaterial } from 'three'
import { FAN_POS } from '@/engine/spec'
import { useDemo } from '@/store/demoStore'
import { FAN_OMEGA, stepFanOmega } from './fanMotion'
import { StaticInstances, type InstanceSpec } from './StaticInstances'
import { FAN_YAW } from './layout'
import type { ScenePalette } from './palette'
import { radialTexture } from './textures'

const HEAD_Y = 1.12

/** Three flattened-sphere blades around the hub, pitched 20°. */
const BLADES: readonly InstanceSpec[] = [0, 1, 2].map((i) => {
  const t = (i / 3) * Math.PI * 2
  return {
    position: [-0.165 * Math.sin(t), 0.165 * Math.cos(t), 0],
    rotation: [0, 0.35, t],
    order: 'ZYX',
    scale: [0.085, 0.15, 0.012],
  }
})
const LED_ON = '#34C759'

/** Procedural standing fan at FAN_POS, turned to face the robot's home spot. */
export function Fan({ palette }: { palette: ScenePalette }) {
  const fan = useDemo((s) => s.room.fan)
  const shadow = useMemo(() => radialTexture(), [])
  const blades = useRef<Group>(null)
  const led = useRef<MeshStandardMaterial>(null)
  const omega = useRef(0)

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const target = fan.on ? FAN_OMEGA[fan.speed] : 0
    omega.current = stepFanOmega(omega.current, target, dt)
    if (blades.current) blades.current.rotation.z -= omega.current * dt
    if (led.current) led.current.emissiveIntensity = fan.on ? 2.2 : 0
  })

  const cageR = 0.34
  return (
    <group position={[FAN_POS.x, 0, FAN_POS.z]} rotation-y={FAN_YAW}>
      <mesh position={[0, 0.012, 0.05]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.9, 0.9]} />
        <meshBasicMaterial
          map={shadow}
          color={palette.shadow}
          transparent
          opacity={palette.shadowOpacity}
          depthWrite={false}
        />
      </mesh>
      {/* base with the power LED */}
      <mesh position={[0, 0.035, 0]}>
        <cylinderGeometry args={[0.24, 0.28, 0.07, 32]} />
        <meshStandardMaterial color={palette.fanBody} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.075, 0.17]}>
        <sphereGeometry args={[0.03, 16, 10]} />
        <meshStandardMaterial
          ref={led}
          color={fan.on ? LED_ON : '#9AA0A6'}
          emissive={LED_ON}
          emissiveIntensity={0}
          toneMapped={false}
        />
      </mesh>
      {/* pole */}
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.026, 0.026, 0.96, 12]} />
        <meshStandardMaterial color={palette.fanAccent} roughness={0.5} />
      </mesh>
      {/* head */}
      <group position={[0, HEAD_Y, 0]}>
        <mesh position={[0, 0, -0.1]} rotation-x={Math.PI / 2}>
          <capsuleGeometry args={[0.085, 0.1, 6, 16]} />
          <meshStandardMaterial color={palette.fanBody} roughness={0.45} />
        </mesh>
        {/* cage: rims + translucent grilles */}
        {[0.06, -0.03].map((z) => (
          <mesh key={z} position={[0, 0, z]}>
            <torusGeometry args={[cageR, 0.013, 8, 48]} />
            <meshStandardMaterial color={palette.fanAccent} roughness={0.4} />
          </mesh>
        ))}
        {[0.062, -0.032].map((z) => (
          <mesh key={z} position={[0, 0, z]}>
            <circleGeometry args={[cageR, 40]} />
            <meshStandardMaterial
              color={palette.fanBody}
              transparent
              opacity={0.14}
              depthWrite={false}
              side={DoubleSide}
            />
          </mesh>
        ))}
        {/* blades */}
        <group ref={blades} position={[0, 0, 0.015]}>
          <StaticInstances items={BLADES}>
            <sphereGeometry args={[1, 20, 12]} />
            <meshStandardMaterial color={palette.fanBlade} roughness={0.4} />
          </StaticInstances>
          <mesh rotation-x={Math.PI / 2} position={[0, 0, 0.02]}>
            <cylinderGeometry args={[0.055, 0.055, 0.05, 20]} />
            <meshStandardMaterial color={palette.fanAccent} roughness={0.4} />
          </mesh>
        </group>
      </group>
    </group>
  )
}
