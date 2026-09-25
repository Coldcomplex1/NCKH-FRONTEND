import raw from './results.json'
import type { MacroRegion } from '@/core/parser'

/**
 * Typed access to the research results (generated from the dashboard by
 * `npm run extract:results`). Every error rate here is a FRACTION (0.0784 = 7.84%).
 */

export interface SplitMetrics {
  werNormalized: number
  werRaw: number
  cerNormalized: number
  utterances: number
}

export interface Results {
  summary: {
    model: string
    dataset: string
    modelRevision: string
    datasetRevision: string
    checkpoint: string
    validation: SplitMetrics
    test: SplitMetrics
    runStart: string
    runEnd: string
    runSpan: string
    trainRuntimeHours: number
  }
  /** Greedy-decoding validation metrics per evaluation step. */
  training: {
    step: number
    epoch: number
    evalLoss: number
    werNormalized: number
    werRaw: number
    cerNormalized: number
  }[]
  /** 5-beam validation metrics for the finalist checkpoints. */
  reranking: { checkpoint: string; werNormalized: number; werRaw: number; cerNormalized: number }[]
  regions: { region: MacroRegion; wer: number; utterances: number }[]
  /** Sorted by WER ascending (rank 1 = lowest). `id` is the ViMD key, e.g. 'QuangBinh'. */
  provinces: { id: string; region: MacroRegion; wer: number; utterances: number }[]
  distribution: {
    labels: string[]
    counts: number[]
    median: number
    p90: number
    perfectRate: number
    highRate: number
    meanUtterance: number
    utterances: number
  }
  examples: {
    file: string
    region: MacroRegion
    province: string
    durationSec: number
    wer: number
    reference: string
    prediction: string
  }[]
  splits: {
    name: 'train' | 'valid' | 'test'
    utterances: number
    hours: number
    minDurationSec: number
    maxDurationSec: number
    over30s: number
    speakers: number
    provinces: number
  }[]
  trainingSetup: {
    trainUtterancesUsed: number
    trainUtterancesDropped: number
    perDeviceBatchSize: number
    gradientAccumulationSteps: number
    effectiveBatchSize: number
    generationMaxLength: number
  }
  recipe: {
    language: string
    task: string
    expandNumbers: boolean
    learningRate: number
    lrScheduler: string
    warmupSteps: number
    maxEpochs: number
    effectiveBatchSize: number
    weightDecay: number
    maxGradNorm: number
    specAugment: boolean
    maskTimeProb: number
    maskTimeLength: number
    evalSteps: number
    earlyStoppingPatience: number
    finalBeams: number
    maxLabelTokens: number
    seed: number
  }
  environment: {
    python: string
    torch: string
    transformers: string
    cuda: string
    cudnn: number
    gpu: string
    gpuVramGb: number
    bf16: boolean
    tf32: boolean
    computeCapability: string
  }
  normalization: { raw: string; normalized: string[] }
}

export const results = raw as unknown as Results
