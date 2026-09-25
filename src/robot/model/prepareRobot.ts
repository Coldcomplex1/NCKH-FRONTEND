import { AnimationClip, type Bone, type Mesh, type Object3D } from 'three'
import type { ClipName } from '@/engine/types'
import { CLIP_DURATION } from '@/engine/spec'

/** The parts of a loaded glTF this module needs (keeps it testable without GLTFLoader types). */
export interface GltfLike {
  scene: Object3D
  animations: AnimationClip[]
}

export interface PreparedRobot {
  /** The model root (also the AnimationMixer root). */
  scene: Object3D
  /** Clips by name, with every `.morphTargetInfluences` track removed. */
  clips: Partial<Record<ClipName, AnimationClip>>
  /** Every mesh with morph targets (the three "Head" primitives); the expressions drive them all. */
  faceMeshes: Mesh[]
  /** The bone the procedural head overlay rotates (child bone of "Neck"). */
  headBone: Bone | null
  /** Tip of the head (the bubble/label anchor). */
  headEnd: Object3D | null
}

const MORPH_SUFFIX = '.morphTargetInfluences'
const KNOWN_CLIPS = new Set<string>(Object.keys(CLIP_DURATION))

/**
 * Every clip in RobotExpressive.glb carries an all-zero morph-weights track for the face. If the
 * mixer kept them it would overwrite the expressions, so they are removed (durations are kept).
 */
export function stripMorphTracks(clip: AnimationClip): AnimationClip {
  const tracks = clip.tracks.filter((t) => !t.name.endsWith(MORPH_SUFFIX))
  if (tracks.length === clip.tracks.length) return clip
  return new AnimationClip(clip.name, clip.duration, tracks, clip.blendMode)
}

const isBone = (o: Object3D): o is Bone => (o as Bone).isBone === true
const isMesh = (o: Object3D): o is Mesh => (o as Mesh).isMesh === true

/** Face meshes are found structurally (never by generated names such as "Head_4"). */
export function findFaceMeshes(root: Object3D): Mesh[] {
  const out: Mesh[] = []
  root.traverse((o) => {
    if (isMesh(o) && o.morphTargetDictionary && Object.keys(o.morphTargetDictionary).length > 0) out.push(o)
  })
  return out
}

export function findHeadBone(root: Object3D): Bone | null {
  const neck = root.getObjectByName('Neck')
  const fromNeck = neck?.children.find(isBone)
  if (fromNeck) return fromNeck
  // Fallback: the bone that holds the face meshes.
  let found: Bone | null = null
  root.traverse((o) => {
    if (found || !isBone(o)) return
    if (o.children.some((c) => c.getObjectByProperty('isMesh', true) && findFaceMeshes(c).length > 0))
      found = o
  })
  return found
}

function findHeadEnd(head: Bone | null): Object3D | null {
  if (!head) return null
  return head.children.find((c) => isBone(c) || c.name.endsWith('_end')) ?? head
}

const cache = new WeakMap<object, PreparedRobot>()

/** Memoized on the (cached) glTF object, so remounts reuse the same prepared clips. */
export function prepareRobot(gltf: GltfLike): PreparedRobot {
  const hit = cache.get(gltf)
  if (hit) return hit
  const clips: Partial<Record<ClipName, AnimationClip>> = {}
  for (const clip of gltf.animations) {
    if (KNOWN_CLIPS.has(clip.name)) clips[clip.name as ClipName] = stripMorphTracks(clip)
  }
  const headBone = findHeadBone(gltf.scene)
  const prepared: PreparedRobot = {
    scene: gltf.scene,
    clips,
    faceMeshes: findFaceMeshes(gltf.scene),
    headBone,
    headEnd: findHeadEnd(headBone),
  }
  cache.set(gltf, prepared)
  return prepared
}
