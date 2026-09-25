import { describe, expect, it } from 'vitest'
import { comparisons } from './comparisons'
import { provinceName } from './provinces'
import { results } from './results'
import { checkpointStep, computeStats, cudnnVersion, median, stats } from './stats'

describe('stats (derived from results.json)', () => {
  it('region utterances and the distribution both sum to the test set', () => {
    const regionN = Object.values(stats.regions).reduce((n, r) => n + r.utterances, 0)
    expect(regionN).toBe(2026)
    expect(stats.distribution.total).toBe(2026)
    expect(stats.test.utterances).toBe(2026)
    expect(stats.provinces.reduce((n, p) => n + p.utterances, 0)).toBe(2026)
  })

  it('province medians', () => {
    expect(stats.provinceMedian).toBeCloseTo(0.0695, 4)
    expect(stats.regions.Central.provinceMedian).toBeCloseTo(0.0898, 4)
    expect(stats.regions.North.provinceMedian).toBeCloseTo(0.06, 4)
    expect(stats.regions.South.provinceMedian).toBeCloseTo(0.0737, 4)
  })

  it('best / worst province and the hardest ten', () => {
    expect(provinceName(stats.best.id, 'vi')).toBe('Sơn La')
    expect(stats.best.wer).toBeCloseTo(0.037, 4)
    expect(stats.best.rank).toBe(1)
    expect(provinceName(stats.worst.id, 'vi')).toBe('Quảng Bình')
    expect(stats.worst.wer).toBeCloseTo(0.185, 4)
    expect(stats.worst.rank).toBe(63)
    expect(stats.hardestRegion).toBe('Central')
    expect(stats.easiestRegion).toBe('North')
    expect(stats.hardest.items).toHaveLength(10)
    expect(stats.hardest.inHardestRegion).toBe(8)
    expect(stats.regionGap.ratio).toBeCloseTo(1.69, 2)
  })

  it('province sample sizes range 26–43, with 25/19/19 provinces per region', () => {
    expect(stats.provinceN).toEqual({ min: 26, max: 43 })
    expect(stats.provinceCount).toBe(63)
    expect(stats.regions.North.provinceCount).toBe(25)
    expect(stats.regions.Central.provinceCount).toBe(19)
    expect(stats.regions.South.provinceCount).toBe(19)
  })

  it('training: greedy curve markers and the 5-beam selection', () => {
    expect(stats.model.checkpointStep).toBe(1750)
    expect(stats.training.selected?.step).toBe(1750)
    expect(stats.training.bestGreedy.step).toBe(2250)
    expect(stats.selectedRerank.checkpoint).toBe('checkpoint-1750')
    expect(stats.selectedRerank.wer).toBe(stats.validation.werNormalized)
    expect(Math.min(...stats.rerank.map((r) => r.wer))).toBe(stats.selectedRerank.wer)
    expect(stats.rerank.every((r) => r.deltaVsSelected >= 0)).toBe(true)
  })

  it('split totals sum only additive columns (speakers are never summed)', () => {
    expect(stats.splitTotals).toEqual({
      utterances: 18949,
      hours: results.splits.reduce((h, s) => h + s.hours, 0),
      over30s: 570,
    })
    expect(Object.keys(stats.splitTotals)).not.toContain('speakers')
    expect(stats.test.speakers).toBe(1344)
  })

  it('headline values and helpers', () => {
    expect(stats.test.werNormalized).toBeCloseTo(0.0784, 4)
    expect(stats.wrongWordsPer100).toBe(8)
    expect(stats.distribution.perfectCount).toBe(195)
    expect(stats.maxExampleWer).toBeGreaterThan(1)
    expect(stats.environment.cudnnVersion).toBe('9.1.0')
    expect(stats.environment.torchVersion).toBe('2.5.1')
    expect(stats.run.spanMinutes).toBe((6 * 24 + 12) * 60 + 10)
    expect(checkpointStep('checkpoint-2250')).toBe(2250)
    expect(cudnnVersion(90100)).toBe('9.1.0')
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
  })

  it('shows the comparison block only when a comparison was measured', () => {
    expect(comparisons.zeroShotTestWer).toBeNull()
    expect(stats.comparison.show).toBe(false)
    const withZero = computeStats(results, { zeroShotTestWer: 0.2, qwenTestWer: null })
    expect(withZero.comparison.show).toBe(true)
    expect(withZero.comparison.gainVsZeroShot).toBeCloseTo((0.2 - stats.test.werNormalized) / 0.2, 6)
  })
})
