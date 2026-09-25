import type { MacroRegion } from '@/core/parser'
import { comparisons } from './comparisons'
import { results, type Results, type SplitMetrics } from './results'

/**
 * Values DERIVED from `results.ts` (+ `comparisons.ts`). The research copy reads numbers only from
 * here, so re-running `npm run extract:results` on a new dashboard updates every sentence on the page.
 * All rates are fractions (0.0784 = 7.84%); format them with `makeFmt`/`useFmt`, never `toFixed`.
 */

/** Display order of the three ViMD macro regions (north → south). */
export const REGIONS = ['North', 'Central', 'South'] as const satisfies readonly MacroRegion[]

/** Whisper's encoder hears at most this many seconds of audio; longer clips are truncated. Model constant. */
export const WHISPER_WINDOW_SEC = 30

/** The dashboard's `distribution.highRate` counts utterances with WER at or above this threshold. */
export const HIGH_WER_THRESHOLD = 0.25

/** Shared 0…max domains of the bar charts (fractions), so bars stay comparable across the page. */
export const SCALES = { valTest: 0.15, regions: 0.12, provinces: 0.2 } as const

/** How many of the worst provinces the "hardest provinces" fact looks at. */
export const HARDEST_N = 10

/** Shape of `comparisons.ts` (measured comparison WERs, null until known). */
export type Comparisons = typeof comparisons

export interface ProvinceStat {
  /** 1 = lowest WER among all provinces. */
  rank: number
  id: string
  region: MacroRegion
  wer: number
  utterances: number
}

export interface RegionStat {
  region: MacroRegion
  /** Region-level WER as reported by the dashboard. */
  wer: number
  utterances: number
  provinceCount: number
  /** Median of the per-province WERs in this region. */
  provinceMedian: number
}

export interface TrainingPoint {
  step: number
  epoch: number
  evalLoss: number
  /** Greedy-decoding validation WER (normalized). */
  wer: number
  werRaw: number
  cer: number
  /** The checkpoint finally selected (after 5-beam reranking). */
  selected: boolean
  /** Lowest greedy validation WER along the run. */
  bestGreedy: boolean
}

export interface RerankStat {
  checkpoint: string
  step: number
  /** 5-beam validation WER (normalized). */
  wer: number
  werRaw: number
  cer: number
  selected: boolean
  /** wer − selected.wer (fraction; 0 for the selected one). */
  deltaVsSelected: number
}

export interface SplitStat {
  name: 'train' | 'valid' | 'test'
  utterances: number
  hours: number
  speakers: number
  over30s: number
  minDurationSec: number
  maxDurationSec: number
  provinces: number
}

export interface ExampleStat {
  /** 1-based position in the worst-examples list (the dashboard's order). */
  index: number
  file: string
  province: string
  region: MacroRegion
  durationSec: number
  wer: number
  reference: string
  prediction: string
}

export interface DistributionBin {
  /** Bin label as in the data, e.g. "0", "0–5", ">30" (percent WER). */
  label: string
  count: number
  share: number
}

export interface RunDateTime {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

export interface Stats {
  model: {
    /** e.g. "vinai/PhoWhisper-large" */
    id: string
    dataset: string
    checkpoint: string
    checkpointStep: number
    beams: number
    maxNewTokens: number
  }
  test: SplitMetrics & { hours: number; speakers: number; provinces: number }
  validation: SplitMetrics & { hours: number; speakers: number; provinces: number }
  /** Test vs validation (both 5-beam, normalized WER). `relative` > 0 means test is lower. */
  testVsValidation: { absolute: number; relative: number }
  /** Rounded "wrong words per 100 reference words" at the test WER. */
  wrongWordsPer100: number

  regions: Record<MacroRegion, RegionStat>
  hardestRegion: MacroRegion
  easiestRegion: MacroRegion
  /** Hardest vs easiest region: gap in WER (fraction) and ratio. */
  regionGap: { gap: number; ratio: number }

  /** All provinces, ranked by WER ascending. */
  provinces: ProvinceStat[]
  provinceCount: number
  /** Median over all per-province WERs. */
  provinceMedian: number
  best: ProvinceStat
  worst: ProvinceStat
  /** The HARDEST_N highest-WER provinces (worst first) and how many are in the hardest region. */
  hardest: { items: ProvinceStat[]; inHardestRegion: number }
  /** Range of test utterances per province. */
  provinceN: { min: number; max: number }

  distribution: {
    bins: DistributionBin[]
    total: number
    median: number
    p90: number
    perfectRate: number
    perfectCount: number
    highRate: number
    highThreshold: number
    meanUtterance: number
  }

  training: {
    points: TrainingPoint[]
    first: TrainingPoint
    last: TrainingPoint
    bestGreedy: TrainingPoint
    /** The selected checkpoint's greedy point (undefined only if the run log lacks that step). */
    selected: TrainingPoint | undefined
  }
  rerank: RerankStat[]
  selectedRerank: RerankStat

  splits: SplitStat[]
  /** Sums of additive columns only. Speakers are NOT summed: they may overlap between splits. */
  splitTotals: { utterances: number; hours: number; over30s: number }

  examples: ExampleStat[]
  maxExampleWer: number

  recipe: Results['recipe'] & {
    perDeviceBatchSize: number
    gradientAccumulationSteps: number
    trainUtterancesUsed: number
    trainUtterancesDropped: number
  }
  environment: Results['environment'] & { cudnnVersion: string; torchVersion: string }
  run: {
    start: RunDateTime | null
    end: RunDateTime | null
    /** Wall-clock length of the run (end − start) in minutes; null if either time is unparseable. */
    spanMinutes: number | null
    runtimeHours: number
  }
  normalization: Results['normalization']

  comparison: {
    /** Show the comparison block only when at least one measured comparison exists. */
    show: boolean
    zeroShot: number | null
    ours: number
    qwen: number | null
    /** (zeroShot − ours) / zeroShot, when zeroShot is known. */
    gainVsZeroShot: number | null
  }
}

/** Median (mean of the two middle values for an even count). */
export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

/** "checkpoint-1750" → 1750 (NaN if the name has no trailing number). */
export function checkpointStep(name: string): number {
  const m = /(\d+)\s*$/.exec(name)
  return m ? Number(m[1]) : Number.NaN
}

/** cuDNN reports 90100 for 9.1.0. */
export function cudnnVersion(n: number): string {
  return `${Math.floor(n / 10000)}.${Math.floor(n / 100) % 100}.${n % 100}`
}

/** "2026-08-24 14:09" → parts (the string is the run log's wall-clock time; kept as written). */
export function parseRunDateTime(s: string): RunDateTime | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s)
  if (!m) return null
  return { year: +m[1]!, month: +m[2]!, day: +m[3]!, hour: +m[4]!, minute: +m[5]! }
}

/** Treat the wall-clock parts as UTC (only differences and display are needed, never the zone). */
export function utcMs(d: RunDateTime): number {
  return Date.UTC(d.year, d.month - 1, d.day, d.hour, d.minute)
}

function extreme<T>(items: readonly T[], key: (t: T) => number, pick: 'min' | 'max'): T {
  let best = items[0] as T
  for (const it of items) {
    if (pick === 'min' ? key(it) < key(best) : key(it) > key(best)) best = it
  }
  return best
}

export function computeStats(r: Results, cmp: Comparisons): Stats {
  const splitOf = (name: SplitStat['name']) => {
    const s = r.splits.find((x) => x.name === name)
    return {
      hours: s?.hours ?? Number.NaN,
      speakers: s?.speakers ?? Number.NaN,
      provinces: s?.provinces ?? 0,
    }
  }
  const test = { ...r.summary.test, ...splitOf('test') }
  const validation = { ...r.summary.validation, ...splitOf('valid') }

  // Provinces, ranked ascending by WER (rank 1 = easiest).
  const provinces: ProvinceStat[] = [...r.provinces]
    .sort((a, b) => a.wer - b.wer)
    .map((p, i) => ({ rank: i + 1, id: p.id, region: p.region, wer: p.wer, utterances: p.utterances }))

  const regionEntries = REGIONS.map((region): RegionStat => {
    const reg = r.regions.find((x) => x.region === region)
    const inRegion = provinces.filter((p) => p.region === region)
    return {
      region,
      wer: reg?.wer ?? Number.NaN,
      utterances: reg?.utterances ?? sum(inRegion.map((p) => p.utterances)),
      provinceCount: inRegion.length,
      provinceMedian: median(inRegion.map((p) => p.wer)),
    }
  })
  const regions = Object.fromEntries(regionEntries.map((x) => [x.region, x])) as Record<
    MacroRegion,
    RegionStat
  >
  const hardestRegion = extreme(regionEntries, (x) => x.wer, 'max').region
  const easiestRegion = extreme(regionEntries, (x) => x.wer, 'min').region

  const hardestItems = provinces.slice(-HARDEST_N).reverse()

  // Training trajectory (greedy) + 5-beam reranking.
  const selStep = checkpointStep(r.summary.checkpoint)
  const minGreedy = Math.min(...r.training.map((t) => t.werNormalized))
  const points: TrainingPoint[] = r.training.map((t) => ({
    step: t.step,
    epoch: t.epoch,
    evalLoss: t.evalLoss,
    wer: t.werNormalized,
    werRaw: t.werRaw,
    cer: t.cerNormalized,
    selected: t.step === selStep,
    bestGreedy: t.werNormalized === minGreedy,
  }))
  const selRaw = r.reranking.find((x) => x.checkpoint === r.summary.checkpoint) ?? r.reranking[0]!
  const rerank: RerankStat[] = r.reranking.map((x) => ({
    checkpoint: x.checkpoint,
    step: checkpointStep(x.checkpoint),
    wer: x.werNormalized,
    werRaw: x.werRaw,
    cer: x.cerNormalized,
    selected: x.checkpoint === selRaw.checkpoint,
    deltaVsSelected: x.werNormalized - selRaw.werNormalized,
  }))

  const d = r.distribution
  const bins = d.labels.map((label, i) => ({
    label,
    count: d.counts[i] ?? 0,
    share: (d.counts[i] ?? 0) / d.utterances,
  }))

  const examples = r.examples.map((e, i) => ({ index: i + 1, ...e }))
  const runStart = parseRunDateTime(r.summary.runStart)
  const runEnd = parseRunDateTime(r.summary.runEnd)
  const ours = r.summary.test.werNormalized

  return {
    model: {
      id: r.summary.model,
      dataset: r.summary.dataset,
      checkpoint: r.summary.checkpoint,
      checkpointStep: selStep,
      beams: r.recipe.finalBeams,
      maxNewTokens: r.trainingSetup.generationMaxLength,
    },
    test,
    validation,
    testVsValidation: {
      absolute: validation.werNormalized - test.werNormalized,
      relative: (validation.werNormalized - test.werNormalized) / validation.werNormalized,
    },
    wrongWordsPer100: Math.round(test.werNormalized * 100),

    regions,
    hardestRegion,
    easiestRegion,
    regionGap: {
      gap: regions[hardestRegion].wer - regions[easiestRegion].wer,
      ratio: regions[hardestRegion].wer / regions[easiestRegion].wer,
    },

    provinces,
    provinceCount: provinces.length,
    provinceMedian: median(provinces.map((p) => p.wer)),
    best: provinces[0]!,
    worst: provinces[provinces.length - 1]!,
    hardest: {
      items: hardestItems,
      inHardestRegion: hardestItems.filter((p) => p.region === hardestRegion).length,
    },
    provinceN: {
      min: Math.min(...provinces.map((p) => p.utterances)),
      max: Math.max(...provinces.map((p) => p.utterances)),
    },

    distribution: {
      bins,
      total: sum(d.counts),
      median: d.median,
      p90: d.p90,
      perfectRate: d.perfectRate,
      perfectCount: d.counts[0] ?? 0,
      highRate: d.highRate,
      highThreshold: HIGH_WER_THRESHOLD,
      meanUtterance: d.meanUtterance,
    },

    training: {
      points,
      first: points[0]!,
      last: points[points.length - 1]!,
      bestGreedy: points.find((p) => p.bestGreedy)!,
      selected: points.find((p) => p.selected),
    },
    rerank,
    selectedRerank: rerank.find((x) => x.selected)!,

    splits: r.splits.map((s) => ({ ...s })),
    splitTotals: {
      utterances: sum(r.splits.map((s) => s.utterances)),
      hours: sum(r.splits.map((s) => s.hours)),
      over30s: sum(r.splits.map((s) => s.over30s)),
    },

    examples,
    maxExampleWer: Math.max(...examples.map((e) => e.wer)),

    recipe: {
      ...r.recipe,
      perDeviceBatchSize: r.trainingSetup.perDeviceBatchSize,
      gradientAccumulationSteps: r.trainingSetup.gradientAccumulationSteps,
      trainUtterancesUsed: r.trainingSetup.trainUtterancesUsed,
      trainUtterancesDropped: r.trainingSetup.trainUtterancesDropped,
    },
    environment: {
      ...r.environment,
      cudnnVersion: cudnnVersion(r.environment.cudnn),
      // "2.5.1+cu121" → "2.5.1" (the CUDA build is shown separately).
      torchVersion: r.environment.torch.split('+')[0] ?? r.environment.torch,
    },
    run: {
      start: runStart,
      end: runEnd,
      spanMinutes: runStart && runEnd ? (utcMs(runEnd) - utcMs(runStart)) / 60_000 : null,
      runtimeHours: r.summary.trainRuntimeHours,
    },
    normalization: r.normalization,

    comparison: {
      show: cmp.zeroShotTestWer !== null || cmp.qwenTestWer !== null,
      zeroShot: cmp.zeroShotTestWer,
      ours,
      qwen: cmp.qwenTestWer,
      gainVsZeroShot:
        cmp.zeroShotTestWer === null ? null : (cmp.zeroShotTestWer - ours) / cmp.zeroShotTestWer,
    },
  }
}

/** The site's derived statistics (computed once at module load). */
export const stats: Stats = computeStats(results, comparisons)
