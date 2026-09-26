import { Quaternion } from 'three'
import { describe, expect, it } from 'vitest'
import { CLIP_DURATION } from '@/engine/spec'
import { normalizeMotion, type MotionScript } from '@/motion/script'
import { flush, makeController, run, track } from './testRobot'

function move(raw: Record<string, unknown>): MotionScript {
  const r = normalizeMotion(raw)
  if (!r.ok) throw new Error(r.errors.join('; '))
  return r.move
}

/** Half a second: squat with the left eye shut, then back up. */
const SQUAT = move({
  name: { vi: 'Ngồi xổm', en: 'Squat' },
  duration: 0.5,
  keys: [
    { t: 0 },
    { t: 0.25, pose: { hipL: [80, 0], hipR: [80, 0], kneeL: [100], kneeR: [100] }, face: { eyeL: 1 } },
    { t: 0.5 },
  ],
})

/** Component-wise distance (angleTo has a ~1e-3 precision floor near 0). */
const qDiff = (a: Quaternion, b: Quaternion) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z), Math.abs(a.w - b.w))

describe('threeController', () => {
  it('resolves a one-shot clip on its own finished event', async () => {
    const { ctrl } = await makeController()
    const t0 = ctrl.time
    const s = track(ctrl.play('Jump'))
    run(ctrl, CLIP_DURATION.Jump - 0.1)
    await flush()
    expect(s.done).toBe(false)
    run(ctrl, 0.2)
    await flush()
    expect(s.done).toBe(true)
    expect(ctrl.time - t0).toBeGreaterThan(CLIP_DURATION.Jump - 0.05)
  })

  it('plays repeats as one LoopRepeat action', async () => {
    const { ctrl } = await makeController()
    const s = track(ctrl.play('Yes', { repeat: 3 }))
    run(ctrl, CLIP_DURATION.Yes * 2.5)
    await flush()
    expect(s.done).toBe(false)
    run(ctrl, CLIP_DURATION.Yes)
    await flush()
    expect(s.done).toBe(true)
  })

  it('holds Sitting and keeps it while the base changes; Standing releases it', async () => {
    const { ctrl, mixer, prepared } = await makeController()
    await Promise.all([ctrl.play('Sitting', { timeScale: 0.6 }), Promise.resolve(run(ctrl, 1.5))])
    ctrl.setBase('Walking')
    run(ctrl, 1)
    const sit = mixer.existingAction(prepared.clips.Sitting!)!
    const walk = mixer.existingAction(prepared.clips.Walking!)!
    expect(sit.getEffectiveWeight()).toBeCloseTo(1)
    expect(walk.isRunning()).toBe(false)
    const s = track(ctrl.play('Standing', { timeScale: 0.6 }))
    run(ctrl, 1.5)
    await flush()
    expect(s.done).toBe(true)
    // Standing is not a hold clip: the controller fades back to the (new) base loop.
    expect(walk.isRunning()).toBe(true)
  })

  it('engine-posture-drift: holdPose snaps into Sitting at once and holds it; Standing releases it', async () => {
    const { ctrl, mixer, prepared } = await makeController()
    run(ctrl, 0.2)
    ctrl.holdPose('Sitting')
    run(ctrl, 1 / 60)
    const sit = mixer.existingAction(prepared.clips.Sitting!)!
    const idle = mixer.existingAction(prepared.clips.Idle!)!
    expect(sit.getEffectiveWeight()).toBeCloseTo(1)
    expect(sit.time).toBeCloseTo(prepared.clips.Sitting!.duration, 3)
    expect(idle.isRunning()).toBe(false)
    ctrl.setBase('Idle')
    run(ctrl, 2)
    expect(sit.getEffectiveWeight()).toBeCloseTo(1)
    const s = track(ctrl.play('Standing', { timeScale: 0.6 }))
    run(ctrl, 1.5)
    await flush()
    expect(s.done).toBe(true)
    expect(idle.isRunning()).toBe(true)
  })

  it('planner-seated-refusal: the head overlay turns (yaw) for a seated "no", and undoes cleanly', async () => {
    const { ctrl, prepared } = await makeController()
    void ctrl.play('Sitting', { timeScale: 0.6 })
    run(ctrl, 2)
    const head = prepared.headBone!
    const rest = head.quaternion.clone()
    void ctrl.head({ yaw: 0.35 }, 200)
    run(ctrl, 0.5)
    expect(head.quaternion.angleTo(rest)).toBeGreaterThan(0.3)
    void ctrl.head({ yaw: 0 }, 200)
    run(ctrl, 0.5)
    expect(qDiff(head.quaternion, rest)).toBeLessThan(1e-6)
  })

  it('moves and turns the outer group, reporting the pose from refs', async () => {
    const { ctrl } = await makeController()
    const m = track(ctrl.moveTo({ x: 1.35, z: 0 }, { speed: 1.35 }))
    run(ctrl, 0.8)
    await flush()
    expect(m.done).toBe(false)
    expect(ctrl.getPose().x).toBeGreaterThan(0.2)
    run(ctrl, 0.6)
    await flush()
    expect(m.done).toBe(true)
    expect(ctrl.getPose().x).toBeCloseTo(1.35, 5)

    const t = track(ctrl.turnTo(Math.PI / 2, { durationMs: 500 }))
    run(ctrl, 0.55)
    await flush()
    expect(t.done).toBe(true)
    expect(ctrl.getPose().yaw).toBeCloseTo(Math.PI / 2, 5)
  })

  it('spins with extraTurns and ends at the same heading', async () => {
    const { ctrl, root } = await makeController()
    const s = track(ctrl.turnTo(0, { extraTurns: 1, durationMs: 1100 }))
    run(ctrl, 0.55)
    expect(Math.abs(root.rotation.y)).toBeGreaterThan(2)
    run(ctrl, 0.6)
    await flush()
    expect(s.done).toBe(true)
    expect(ctrl.getPose().yaw).toBeCloseTo(0, 5)
  })

  it('replaying the active clip restarts it at full weight (no blend toward the bind pose)', async () => {
    const { ctrl, mixer, prepared } = await makeController()
    const first = track(ctrl.play('Jump'))
    run(ctrl, 0.4)
    const second = track(ctrl.play('Jump'))
    await flush()
    // The superseded call resolves right away; the new one waits for its own finish.
    expect(first.done).toBe(true)
    expect(second.done).toBe(false)
    const jump = mixer.existingAction(prepared.clips.Jump!)!
    run(ctrl, 1 / 60)
    expect(jump.getEffectiveWeight()).toBeCloseTo(1)
    expect(jump.time).toBeLessThan(0.1)
    run(ctrl, CLIP_DURATION.Jump + 0.1)
    await flush()
    expect(second.done).toBe(true)
  })

  it('waits in controller time only', async () => {
    const { ctrl } = await makeController()
    const w = track(ctrl.wait(500))
    await flush()
    expect(w.done).toBe(false)
    run(ctrl, 0.45)
    await flush()
    expect(w.done).toBe(false)
    run(ctrl, 0.1)
    await flush()
    expect(w.done).toBe(true)
  })

  it('cancel resolves every pending promise immediately', async () => {
    const { ctrl } = await makeController()
    const all = [
      track(ctrl.play('Wave', { repeat: 3 })),
      track(ctrl.moveTo({ x: 2, z: 1 }, { speed: 0.5 })),
      track(ctrl.turnTo(1, { durationMs: 5000 })),
      track(ctrl.wait(10_000)),
      track(ctrl.expression('Sad', 1, 5000)),
      track(ctrl.head({ pitch: 0.3 }, 5000)),
    ]
    run(ctrl, 0.2)
    ctrl.cancel()
    await flush()
    expect(all.every((s) => s.done)).toBe(true)
    const pose = ctrl.getPose()
    expect(pose.x).toBeLessThan(2)
  })

  it('a watchdog resolves a clip whose finished event is lost', async () => {
    const { ctrl, mixer } = await makeController()
    const s = track(ctrl.play('Punch'))
    mixer.stopAllAction() // the action never finishes → no 'finished' event
    run(ctrl, CLIP_DURATION.Punch + 0.5)
    await flush()
    expect(s.done).toBe(false)
    run(ctrl, 1)
    await flush()
    expect(s.done).toBe(true)
  })

  it('drives expressions on every face mesh (the mixer no longer owns them)', async () => {
    const { ctrl, prepared } = await makeController()
    ctrl.setBase('Dance')
    void ctrl.expression('Sad', 0.8, 200)
    run(ctrl, 0.5)
    for (const m of prepared.faceMeshes) {
      const d = m.morphTargetDictionary!
      expect(m.morphTargetInfluences![d.Sad!]).toBeCloseTo(0.8)
      expect(m.morphTargetInfluences![d.Angry!]).toBe(0)
    }
    void ctrl.expression(null, 1, 200)
    run(ctrl, 0.5)
    for (const m of prepared.faceMeshes) expect(m.morphTargetInfluences!.every((v) => v === 0)).toBe(true)
  })

  it('head overlay never accumulates on a held pose and undoes cleanly', async () => {
    const { ctrl, prepared } = await makeController()
    void ctrl.play('Sitting', { timeScale: 0.6 })
    run(ctrl, 2)
    const head = prepared.headBone!
    const rest = head.quaternion.clone()
    void ctrl.head({ pitch: 0.35 }, 300)
    run(ctrl, 1)
    const tilted = head.quaternion.clone()
    expect(tilted.angleTo(rest)).toBeGreaterThan(0.3)
    run(ctrl, 60)
    expect(qDiff(head.quaternion, tilted)).toBeLessThan(1e-9)
    void ctrl.head({ pitch: 0 }, 300)
    run(ctrl, 1)
    expect(qDiff(head.quaternion, rest)).toBeLessThan(1e-6)
  })

  it('dispose resolves pending work and resets the face', async () => {
    const { ctrl, prepared } = await makeController()
    void ctrl.expression('Angry', 1, 100)
    run(ctrl, 0.5)
    const w = track(ctrl.wait(9999))
    const m = track(ctrl.moveTo({ x: 1, z: 1 }, { speed: 0.2 }))
    ctrl.dispose()
    await flush()
    expect(w.done && m.done).toBe(true)
    for (const mesh of prepared.faceMeshes)
      expect(mesh.morphTargetInfluences!.every((v) => v === 0)).toBe(true)
    // Calls after dispose resolve immediately.
    const late = track(ctrl.play('Jump'))
    await flush()
    expect(late.done).toBe(true)
  })
  it('perform plays a compiled move, glides the root, resolves, then returns to Idle cleanly', async () => {
    const { ctrl, mixer, prepared } = await makeController()
    const bone = prepared.scene.getObjectByName('Bone')!
    const restBone = bone.quaternion.clone()
    const restBonePos = bone.position.clone()
    const face = prepared.faceFeatures!
    const eyeL = face.morphTargetDictionary!.EyeCloseL!
    const p = track(ctrl.perform(SQUAT, { count: 2, to: { x: 0.5, z: 0 }, timeScale: 1 }))
    run(ctrl, 0.5)
    await flush()
    expect(p.done).toBe(false)
    expect(ctrl.getPose().x).toBeGreaterThan(0.1)
    run(ctrl, 0.6)
    await flush()
    expect(p.done).toBe(true)
    expect(ctrl.getPose().x).toBeCloseTo(0.5, 3)
    // Idle takes over; once the move has faded out its actions are dropped and nothing is left behind.
    run(ctrl, 1)
    const idle = mixer.existingAction(prepared.clips.Idle!)!
    expect(idle.getEffectiveWeight()).toBeCloseTo(1)
    expect(qDiff(bone.quaternion, restBone)).toBeLessThan(1e-6)
    expect(bone.position.distanceTo(restBonePos)).toBeLessThan(1e-6)
    expect(face.morphTargetInfluences![eyeL]).toBe(0)
  })

  it('a looping perform (the thinking pose) runs until cancel, then fades back to Idle', async () => {
    const { ctrl, mixer, prepared } = await makeController()
    const p = track(ctrl.perform(SQUAT, { count: 1, to: { x: 0, z: 0 }, loop: true }))
    run(ctrl, 5)
    await flush()
    expect(p.done).toBe(false)
    ctrl.cancel()
    await flush()
    expect(p.done).toBe(true)
    run(ctrl, 1)
    expect(mixer.existingAction(prepared.clips.Idle!)!.getEffectiveWeight()).toBeCloseTo(1)
  })

  it('perform without a rig resolves at once', async () => {
    const { ctrl } = await makeController({ rig: null })
    const p = track(ctrl.perform(SQUAT, { count: 1, to: { x: 1, z: 0 } }))
    await flush()
    expect(p.done).toBe(true)
    expect(ctrl.getPose().x).toBe(0)
  })
})
