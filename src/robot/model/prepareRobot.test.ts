import { AnimationClip, NumberKeyframeTrack, VectorKeyframeTrack } from 'three'
import { describe, expect, it } from 'vitest'
import { CLIP_DURATION } from '@/engine/spec'
import type { ClipName } from '@/engine/types'
import { prepareRobot, stripMorphTracks } from './prepareRobot'
import { loadRobotGltf } from './testRobot'

describe('stripMorphTracks', () => {
  it('removes morph-weight tracks and keeps the original duration', () => {
    const clip = new AnimationClip('Wave', 1.833, [
      new NumberKeyframeTrack('Head_4.morphTargetInfluences', [0, 1], [0, 0, 0, 0, 0, 0]),
      new VectorKeyframeTrack('Body.position', [0, 0.5], [0, 0, 0, 0, 1, 0]),
    ])
    const out = stripMorphTracks(clip)
    expect(out.tracks.map((t) => t.name)).toEqual(['Body.position'])
    expect(out.duration).toBe(1.833)
    expect(out.name).toBe('Wave')
  })

  it('returns the same clip when there is nothing to strip', () => {
    const clip = new AnimationClip('Idle', 3, [
      new VectorKeyframeTrack('Body.position', [0, 1], [0, 0, 0, 0, 1, 0]),
    ])
    expect(stripMorphTracks(clip)).toBe(clip)
  })
})

describe('prepareRobot (real RobotExpressive.glb)', () => {
  it('keeps the 13 contract clips with their durations and no morph tracks', async () => {
    const gltf = await loadRobotGltf()
    const p = prepareRobot(gltf)
    const names = Object.keys(p.clips).sort()
    expect(names).toEqual(Object.keys(CLIP_DURATION).sort())
    for (const name of names as ClipName[]) {
      const clip = p.clips[name]!
      expect(clip.duration).toBeCloseTo(CLIP_DURATION[name], 2)
      expect(clip.tracks.some((t) => t.name.endsWith('.morphTargetInfluences'))).toBe(false)
      expect(clip.tracks.length).toBeGreaterThan(0)
    }
  })

  it('finds the face meshes, head bone and head tip structurally, and memoizes', async () => {
    const gltf = await loadRobotGltf()
    const p = prepareRobot(gltf)
    expect(p.faceMeshes).toHaveLength(3)
    for (const m of p.faceMeshes) {
      expect(Object.keys(m.morphTargetDictionary!).sort()).toEqual(['Angry', 'Sad', 'Surprised'])
    }
    expect(p.headBone?.name).toBe('Head')
    expect(p.headEnd?.name).toBe('Head_end')
    expect(prepareRobot(gltf)).toBe(p)
  })
})
