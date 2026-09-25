import { AnimationMixer, Group } from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { prepareRobot } from './prepareRobot'
import { createThreeController } from './threeController'

/** Test-only helpers: parse the real RobotExpressive.glb in node (no WebGL needed). */

const GLB = new URL('../../../public/models/RobotExpressive.glb', import.meta.url)

// The app tsconfig has no node types (on purpose): reach node:fs through getBuiltinModule.
interface NodeFs {
  readFileSync(path: URL): Uint8Array
}
const nodeProcess = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process

export function loadRobotGltf(): Promise<GLTF> {
  const buf = (nodeProcess.getBuiltinModule('node:fs') as NodeFs).readFileSync(GLB)
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  return new Promise((resolve, reject) => new GLTFLoader().parse(ab, '', resolve, reject))
}

export async function makeController() {
  const gltf = await loadRobotGltf()
  const prepared = prepareRobot(gltf)
  const root = new Group()
  root.add(prepared.scene)
  const mixer = new AnimationMixer(prepared.scene)
  const ctrl = createThreeController({
    mixer,
    clips: prepared.clips,
    root,
    model: prepared.scene,
    faceMeshes: prepared.faceMeshes,
    headBone: prepared.headBone,
  })
  return { gltf, prepared, root, mixer, ctrl }
}

/** Tracks whether a promise has settled (check after `flush()`). */
export function track(p: Promise<unknown>) {
  const s = { done: false }
  void p.then(() => (s.done = true))
  return s
}

export const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

/** Tick `seconds` of controller time at 60 fps. */
export function run(ctrl: { tick(dt: number): void }, seconds: number) {
  const n = Math.round(seconds * 60)
  for (let i = 0; i < n; i++) ctrl.tick(1 / 60)
}
