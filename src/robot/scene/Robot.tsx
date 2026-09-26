import { useFrame, useLoader } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { AnimationMixer, type Group } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { controllerBridge } from '@/engine/bridge'
import { HOME, MODEL_URL, ROBOT_SCALE } from '@/engine/spec'
import { demo } from '@/store/demoStore'
import { prepareRobot } from '../model/prepareRobot'
import { createThreeController, type ThreeController } from '../model/threeController'
import { BlobShadow } from './BlobShadow'
import type { ScenePalette } from './palette'

/** Byte progress of the model download → store (null when the size is unknown). */
function onProgress(e: ProgressEvent<EventTarget>): void {
  const p = e.lengthComputable && e.total > 0 ? Math.min(1, e.loaded / e.total) : null
  demo().setScene({ progress: p })
}

/**
 * The robot: loads RobotExpressive.glb (three's own GLTFLoader; no Draco/meshopt needed), prepares
 * it once, owns its AnimationMixer and registers the AnimationController with the engine bridge.
 * One useFrame at priority −1 ticks the controller (undo head overlay → mixer → tweens → overlay →
 * expressions), so it runs before the camera and never takes over rendering.
 */
export function Robot({
  root,
  palette,
}: {
  /** Outer group (position + yaw); also read by the camera rig. */
  root: RefObject<Group | null>
  palette: ScenePalette
}) {
  const gltf = useLoader(GLTFLoader, MODEL_URL, undefined, onProgress)
  const prepared = useMemo(() => prepareRobot(gltf), [gltf])
  const hips = useMemo(() => prepared.scene.getObjectByName('Hips') ?? null, [prepared])
  const ctrlRef = useRef<ThreeController | null>(null)

  useEffect(() => {
    const group = root.current
    if (!group) return
    group.position.set(HOME.x, 0, HOME.z)
    group.rotation.set(0, 0, 0)
    const mixer = new AnimationMixer(prepared.scene)
    const ctrl = createThreeController({
      mixer,
      clips: prepared.clips,
      root: group,
      model: prepared.scene,
      faceMeshes: prepared.faceMeshes,
      headBone: prepared.headBone,
      rig: prepared.rig,
    })
    ctrlRef.current = ctrl
    controllerBridge.attach(ctrl)
    demo().setScene({ status: 'ready', progress: 1 })
    return () => {
      controllerBridge.detach(ctrl)
      ctrl.dispose()
      if (ctrlRef.current === ctrl) ctrlRef.current = null
    }
  }, [prepared, root])

  useFrame((_, dt) => ctrlRef.current?.tick(Math.min(dt, 0.1)), -1)

  return (
    <>
      <group ref={root}>
        <primitive object={prepared.scene} scale={ROBOT_SCALE} />
      </group>
      <BlobShadow target={root} body={hips} palette={palette} />
    </>
  )
}
