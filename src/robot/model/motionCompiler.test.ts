import { AnimationMixer, Box3, Group, Vector3, type Object3D, type SkinnedMesh } from 'three'
import { describe, expect, it } from 'vitest'
import { ROBOT_SCALE } from '@/engine/spec'
import { normalizeMotion, type MotionScript } from '@/motion/script'
import { compileMotion } from './motionCompiler'
import { prepareRobot } from './prepareRobot'
import { loadRobotGltf } from './testRobot'

/** Metres in model space (the tests keep the scene unscaled). */
const M = 1 / ROBOT_SCALE

async function setup() {
  const gltf = await loadRobotGltf()
  const prepared = prepareRobot(gltf)
  const root = new Group()
  root.add(prepared.scene)
  root.updateMatrixWorld(true)
  return { prepared, root, scene: prepared.scene, rig: prepared.rig! }
}

function move(raw: Record<string, unknown>): MotionScript {
  const r = normalizeMotion(raw)
  if (!r.ok) throw new Error(r.errors.join('; '))
  return r.move
}

/** Pose the model at loop time `t` of the compiled move (full weight, no other action). */
function poseAt(scene: Object3D, clip: ReturnType<typeof compileMotion>['clip'], t: number) {
  const mixer = new AnimationMixer(scene)
  const action = mixer.clipAction(clip)
  action.play()
  mixer.setTime(t)
  scene.updateMatrixWorld(true)
  return mixer
}

const wp = (scene: Object3D, name: string) => scene.getObjectByName(name)!.getWorldPosition(new Vector3())

/** Lowest point of all meshes (skinned hands included), model space. */
function lowestY(scene: Object3D): number {
  const box = new Box3()
  scene.traverse((o) => {
    const m = o as Object3D & {
      isMesh?: boolean
      isSkinnedMesh?: boolean
      geometry?: { attributes: { position: { count: number } } }
    }
    if (!m.isMesh || m.isSkinnedMesh) return
    box.expandByObject(o, true)
  })
  return box.min.y
}

/** Lowest vertex of the skinned hands (their raw geometry is stored in another pose). */
function handsLowest(scene: Object3D): number {
  let min = Infinity
  scene.traverse((o) => {
    const m = o as unknown as SkinnedMesh
    if (!m.isSkinnedMesh) return
    const pos = m.geometry.attributes.position!
    for (let i = 0; i < pos.count; i++) {
      const p = m.applyBoneTransform(i, new Vector3().fromBufferAttribute(pos, i)).applyMatrix4(m.matrixWorld)
      min = Math.min(min, p.y)
    }
  })
  return min
}

describe('compileMotion (real RobotExpressive.glb)', () => {
  it('captures a rig with a sensible idle stance', async () => {
    const { rig } = await setup()
    // Idle arms hang a little out with bent elbows; legs are slightly bent.
    expect(rig.stance.shoulderL[0]).toBeGreaterThan(15)
    expect(rig.stance.shoulderL[0]).toBeLessThan(40)
    expect(rig.stance.elbowL[0]).toBeGreaterThan(40)
    expect(rig.stance.kneeL[0]).toBeGreaterThan(25)
    expect(rig.contacts.length).toBeGreaterThan(10)
  })

  it('the neutral stance reproduces the rest pose (feet on the floor, hands where they were)', async () => {
    const { scene, rig } = await setup()
    const restHand = wp(scene, 'Palm2L')
    const restFoot = wp(scene, 'FootR')
    const clip = compileMotion(rig, move({ duration: 1, keys: [{ t: 0 }, { t: 1 }] })).clip
    poseAt(scene, clip, 0.5)
    expect(wp(scene, 'Palm2L').distanceTo(restHand)).toBeLessThan(0.02 * M)
    expect(wp(scene, 'FootR').distanceTo(restFoot)).toBeLessThan(0.02 * M)
    expect(Math.abs(lowestY(scene))).toBeLessThan(0.01 * M)
  })

  it('shoulder raise 90 / dir 90 holds the upper arm out horizontally to the robot’s left', async () => {
    const { scene, rig } = await setup()
    const clip = compileMotion(
      rig,
      move({
        duration: 1,
        keys: [
          { t: 0, pose: { shoulderL: [90, 90], elbowL: [0] } },
          { t: 1, pose: { shoulderL: [90, 90], elbowL: [0] } },
        ],
      }),
    ).clip
    poseAt(scene, clip, 0.5)
    const d = wp(scene, 'LowerArmL').sub(wp(scene, 'UpperArmL')).normalize()
    expect(Math.asin(Math.abs(d.y)) * (180 / Math.PI)).toBeLessThan(5)
    expect(d.x).toBeGreaterThan(0.95)
  })

  it('arms straight up put both hands above the head', async () => {
    const { scene, rig } = await setup()
    const up = { shoulderL: [180, 0], shoulderR: [180, 0], elbowL: [0], elbowR: [0] }
    const clip = compileMotion(
      rig,
      move({
        duration: 1,
        keys: [
          { t: 0, pose: up },
          { t: 1, pose: up },
        ],
      }),
    ).clip
    poseAt(scene, clip, 0.5)
    const head = wp(scene, 'Head_end').y
    expect(wp(scene, 'Palm2L').y).toBeGreaterThan(head)
    expect(wp(scene, 'Palm2R').y).toBeGreaterThan(head)
  })

  it('a crouch lowers the body while the feet stay on the floor and on the shins', async () => {
    const { scene, rig } = await setup()
    const restBody = wp(scene, 'Body').y
    const crouch = { hipL: [90, 0], hipR: [90, 0], kneeL: [110], kneeR: [110], torso: [20, 0, 0] }
    const clip = compileMotion(
      rig,
      move({
        duration: 1,
        keys: [
          { t: 0, pose: crouch },
          { t: 1, pose: crouch },
        ],
      }),
    ).clip
    poseAt(scene, clip, 0.5)
    expect(wp(scene, 'Body').y).toBeLessThan(restBody - 0.12 * M)
    expect(Math.abs(lowestY(scene))).toBeLessThan(0.01 * M)
    for (const s of ['L', 'R']) {
      expect(wp(scene, `Foot${s}`).distanceTo(wp(scene, `LowerLeg${s}_end`))).toBeLessThan(0.02 * M)
    }
  })

  it('a backflip turns the body upside down mid-air, lowest point at `lift`, and ends upright', async () => {
    const { scene, rig } = await setup()
    const m = move({
      duration: 1.2,
      keys: [{ t: 0 }, { t: 0.6, body: { lift: 0.4, pitch: -180 } }, { t: 1.2, body: { pitch: -360 } }],
    })
    expect(m.keys[2]!.body.pitch).toBe(-360)
    const clip = compileMotion(rig, m).clip
    poseAt(scene, clip, 0.6)
    expect(wp(scene, 'Head_end').y).toBeLessThan(wp(scene, 'FootL').y) // upside down
    expect(lowestY(scene)).toBeCloseTo(0.4 * M, 1)
    poseAt(scene, clip, 1.2)
    expect(wp(scene, 'Head_end').y).toBeGreaterThan(wp(scene, 'FootL').y)
    expect(Math.abs(lowestY(scene))).toBeLessThan(0.02 * M)
  })

  it('upright, a low hand swings forward instead of holding the robot up', async () => {
    const { scene, rig } = await setup()
    // A deep crouch with the arms left in the relaxed stance: the hands would go through the floor.
    const crouch = { hipL: [95, 0], hipR: [95, 0], kneeL: [120], kneeR: [120] }
    const clip = compileMotion(
      rig,
      move({ duration: 1, keys: [{ t: 0 }, { t: 0.5, pose: crouch }, { t: 1 }] }),
    ).clip
    poseAt(scene, clip, 0.5)
    expect(Math.abs(lowestY(scene))).toBeLessThan(0.01 * M) // the feet carry it
    expect(handsLowest(scene)).toBeGreaterThan(-0.005 * M) // the hands stay above the floor
  })

  it('tipped over (a handstand), the hands hold the robot up', async () => {
    const { scene, rig } = await setup()
    const stand = {
      shoulderL: [180, 0],
      shoulderR: [180, 0],
      elbowL: [0],
      elbowR: [0],
      hipL: [0, 0],
      hipR: [0, 0],
      kneeL: [0],
      kneeR: [0],
    }
    const clip = compileMotion(
      rig,
      move({
        duration: 1,
        keys: [{ t: 0 }, { t: 0.5, pose: stand, body: { pitch: 180 } }, { t: 1, body: { pitch: 360 } }],
      }),
    ).clip
    poseAt(scene, clip, 0.5)
    expect(Math.abs(handsLowest(scene))).toBeLessThan(0.02 * M)
    expect(wp(scene, 'FootL').y).toBeGreaterThan(1.2 * M)
  })

  it('closes one eye only', async () => {
    const { scene, rig, prepared } = await setup()
    const face = prepared.faceFeatures!
    const clip = compileMotion(
      rig,
      move({
        duration: 1,
        keys: [
          { t: 0, face: { eyeL: 1 } },
          { t: 1, face: { eyeL: 1 } },
        ],
      }),
    ).clip
    poseAt(scene, clip, 0.5)
    const dict = face.morphTargetDictionary!
    expect(face.morphTargetInfluences![dict.EyeCloseL!]).toBeCloseTo(1)
    expect(face.morphTargetInfluences![dict.EyeCloseR!]).toBeCloseTo(0)
  })

  it('a repeating loop ends where it starts (no pop between cycles)', async () => {
    const { rig } = await setup()
    const m = move({
      loops: 3,
      keys: [
        { t: 0, pose: { shoulderR: [150, 60] } },
        { t: 0.4, pose: { shoulderR: [150, 110] } },
      ],
    })
    expect(m.duration).toBeGreaterThanOrEqual(0.6)
    const { clip } = compileMotion(rig, m)
    const track = clip.tracks.find((t) => t.name === 'UpperArmR.quaternion')!
    const v = track.values
    const n = v.length / 4
    const first = [v[0], v[1], v[2], v[3]]
    const last = [v[(n - 1) * 4], v[(n - 1) * 4 + 1], v[(n - 1) * 4 + 2], v[(n - 1) * 4 + 3]]
    const dot = Math.abs(first.reduce((acc, x, i) => acc + x! * last[i]!, 0))
    expect(dot).toBeGreaterThan(0.9999)
  })
})
