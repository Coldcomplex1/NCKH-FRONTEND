import { project } from '@/content/project'
import { provinceName } from '@/content/provinces'
import { SCALES, WHISPER_WINDOW_SEC } from '@/content/stats'
import type { MacroRegion } from '@/core/parser'
import { ENV } from '@/lib/env'
import { runDate, sci, signedPp, spanText } from './helpers'
import type { ResearchCopy } from './types'

/** English research copy. Every figure comes from `stats`. */

const region: Record<MacroRegion, string> = { North: 'North', Central: 'Central', South: 'South' }
const regionLong: Record<MacroRegion, string> = {
  North: 'Northern Vietnam',
  Central: 'Central Vietnam',
  South: 'Southern Vietnam',
}
const name = (id: string): string => provinceName(id, 'en')

export const copyEn: ResearchCopy = {
  label: 'Research',
  common: {
    region,
    regionLong,
    split: { train: 'Train', valid: 'Validation', test: 'Test' },
    lowerIsBetter: 'Lower is better',
    soon: 'Coming soon',
    newTab: '(opens in a new tab)',
    n: (n, f) => `n = ${f.int(n)}`,
    utterances: (n, f) => `${f.int(n)} utterances`,
    seconds: (sec, f) => `${f.num(sec, 1)} s`,
    scale: (max, f) => `Shared scale 0–${f.pct(max, 0)}`,
    yes: 'yes',
    no: 'no',
  },

  overview: {
    eyebrow: (team) => `Student research project · ${team}`,
    lede: (s, f) =>
      `We fine-tuned PhoWhisper-large on ViMD, a multi-dialect dataset covering ${f.int(s.provinceCount)} provinces, so that machines understand Vietnamese from every region — especially older people with strong regional accents. The robot ${project.botName} above is a demo of the whole system.`,
    mentor: 'Mentor',
    tryRobot: 'Try the robot',
    seeResults: 'See the results',
    fullReport: 'Full technical report',
    otherTitle: 'Vietnamese title',
  },

  problem: {
    heading: 'Why this project?',
    intro: 'Speech recognition is everywhere, but it does not yet work equally well for everyone.',
    access: {
      title: 'Voice assistants rarely know regional accents',
      body: 'Voice assistants are mostly trained on standard accents. Older people with strong regional accents often have to repeat themselves — or give up and ask a grandchild to tap the screen for them.',
    },
    data: {
      title: 'What our own numbers show',
      body: (s, f) =>
        `Even after fine-tuning, speech from ${regionLong[s.hardestRegion]} is still the hardest: WER **${f.pct(s.regions[s.hardestRegion].wer)}** versus **${f.pct(s.regions[s.easiestRegion].wer)}** for ${regionLong[s.easiestRegion]} (**${f.num(s.regionGap.ratio)}×**). **${f.int(s.hardest.inHardestRegion)} of the ${f.int(s.hardest.items.length)}** hardest provinces are in ${regionLong[s.hardestRegion]}; the hardest is **${name(s.worst.id)}** (**${f.pct(s.worst.wer)}**).`,
      caveat: (s, f) =>
        `Each province has only ${f.int(s.provinceN.min)}–${f.int(s.provinceN.max)} test utterances, so read the per-province ranking together with its sample size.`,
    },
    goal: {
      title: 'The goal: voice technology for everyone',
      body: (s, f) =>
        `Fine-tune PhoWhisper on speech from all ${f.int(s.provinceCount)} provinces in ViMD, then add a post-correction step with a large language model (Qwen, coming soon) to fix the remaining errors — so anyone can give commands in their own voice.`,
    },
  },

  pipeline: {
    heading: 'How does the system work?',
    intro: 'A command passes through five steps, from spoken words to the robot moving.',
    more: 'Learn more',
    stepLabel: (i, total) => `Step ${i} of ${total}`,
    nodes: {
      input: {
        title: 'Speech / Text',
        sub: () => 'Microphone or keyboard',
        body: () =>
          ENV.asr.enabled
            ? 'You speak or type a command in Vietnamese, in any regional accent — both work.'
            : 'You speak or type a command in Vietnamese, in any regional accent. The demo currently takes text; the voice tab switches on once the recognition server is ready.',
      },
      asr: {
        title: 'PhoWhisper-large + ViMD',
        sub: (s) => `${s.model.checkpoint} · ${s.model.beams}-beam`,
        body: (s, f) =>
          `VinAI's PhoWhisper-large speech-recognition model, fine-tuned by the team on ViMD, turns speech into text. Its test WER is ${f.pct(s.test.werNormalized)}.`,
      },
      qwen: {
        title: 'Qwen post-correction',
        sub: () => 'Large language model',
        body: () =>
          'A large language model will re-read the transcript and fix the errors that remain. This step is still in development, so there are no measurements yet.',
      },
      nlu: {
        title: 'Command understanding (rule-based NLU)',
        sub: () => 'Replaceable by an LLM',
        body: () =>
          'Rules recognise regional words ({{chừ, rứa, mô, quẹo…}}) and what the command asks for. It sits behind a common interface, so a language model can replace it later.',
      },
      robot: {
        title: '3D robot',
        sub: () => project.botName,
        body: () => `${project.botName} acts out the command in a 3D room and answers in text and speech.`,
      },
    },
  },

  results: {
    heading: 'Headline results',
    intro: (s) =>
      `Checkpoint ${s.model.checkpoint} with ${s.model.beams}-beam decoding, scored on the ViMD test set — utterances never used in training.`,
    wer: {
      label: 'Test WER',
      value: (s, f) => f.pct(s.test.werNormalized),
      sub: () => 'Word error rate',
    },
    cer: {
      label: 'Test CER',
      value: (s, f) => f.pct(s.test.cerNormalized),
      sub: () => 'Character error rate',
    },
    size: {
      label: 'Test set size',
      value: (s, f) => f.int(s.test.utterances),
      unit: 'utterances',
      sub: (s, f) => `${f.num(s.test.hours)} hours of audio`,
    },
    coverage: {
      label: 'Coverage',
      value: (s, f) => f.int(s.test.provinces),
      unit: 'provinces',
      sub: (s, f) => `${f.int(s.test.speakers)} speakers in the test set`,
    },
    what: {
      summary: 'What is WER?',
      formula: 'WER = (S + D + I) / N',
      legend:
        'S: words heard as a different word · D: words left out · I: extra words inserted · N: words in the reference transcript.',
      body: (s, f) =>
        `A WER of ${f.pct(s.test.werNormalized)} means roughly ${f.int(s.wrongWordsPer100)} wrong words in every 100.`,
      raw: (s, f) =>
        `This figure is scored after normalization (lower case, no punctuation, numbers written as words — see the Data section). On the raw text the WER is ${f.pct(s.test.werRaw)}; the difference comes from how the text is written, such as capitals and punctuation, not from what was heard.`,
    },
    comparison: {
      title: 'Comparison on the same test set',
      takeaway: (s, f) =>
        s.comparison.gainVsZeroShot === null
          ? `The fine-tuned model reaches a WER of ${f.pct(s.comparison.ours)}.`
          : `Fine-tuning lowers the WER by ${f.pct(s.comparison.gainVsZeroShot, 0)} relative to the original model.`,
      zeroShot: 'Original PhoWhisper-large (not fine-tuned)',
      ours: 'Fine-tuned on ViMD',
      qwen: 'With Qwen post-correction',
      tableCols: ['Model', 'Test WER'],
    },
  },

  quality: {
    heading: 'Is the model stable?',
    intro:
      'Three checks: compare two data splits, follow the training run, and re-score the best checkpoints.',
    valTest: {
      title: 'Validation and test splits',
      takeaway: (s, f) =>
        s.test.werNormalized <= s.validation.werNormalized
          ? `Test WER (${f.pct(s.test.werNormalized)}) is not higher than validation WER (${f.pct(s.validation.werNormalized)}): no sign of overfitting to the validation set.`
          : `Test WER (${f.pct(s.test.werNormalized)}) is ${f.pp(-s.testVsValidation.absolute)} higher than validation WER (${f.pct(s.validation.werNormalized)}).`,
      metrics: { wer: 'WER (normalized)', werRaw: 'WER (raw)', cer: 'CER (normalized)' },
      series: { validation: 'Validation', test: 'Test' },
      note: (s) =>
        `Both splits use ${s.model.beams}-beam decoding. The checkpoint was picked on validation, so the test split is the independent measure.`,
      tableCols: ['Metric', 'Validation', 'Test'],
    },
    trajectory: {
      title: 'Validation WER during training (greedy decoding)',
      takeaway: (s, f) =>
        `Greedy WER falls from ${f.pct(s.training.first.wer)} at step ${f.int(s.training.first.step)} to ${f.pct(s.training.last.wer)} at step ${f.int(s.training.last.step)}.`,
      xLabel: 'Training step',
      axisNote: 'The vertical axis does not start at 0, so that small changes are visible.',
      svgTitle: 'Line chart: validation WER (greedy) by training step',
      svgDesc: (s, f) =>
        `${f.int(s.training.points.length)} evaluations from step ${f.int(s.training.first.step)} to ${f.int(s.training.last.step)}. The lowest greedy WER is ${f.pct(s.training.bestGreedy.wer)} at step ${f.int(s.training.bestGreedy.step)}.`,
      pointLabel: (p, f) => `Step ${f.int(p.step)}: WER ${f.pct(p.wer)}`,
      detail: (p, f) =>
        `Step ${f.int(p.step)} · epoch ${f.num(p.epoch, 1)} · WER ${f.pct(p.wer)} · CER ${f.pct(p.cer)} · raw WER ${f.pct(p.werRaw)} · eval loss ${f.num(p.evalLoss, 3)}`,
      selected: (s) => `Chosen after ${s.model.beams}-beam reranking`,
      bestGreedy: 'Best greedy',
      beamNote: (s, f) =>
        s.training.selected
          ? `The curve uses greedy decoding (fast, used during training), so at step ${f.int(s.training.selected.step)} its WER is ${f.pct(s.training.selected.wer)} — higher than the **${f.pct(s.validation.werNormalized)}** validation figure above, which uses ${s.model.beams}-beam decoding.`
          : `The curve uses greedy decoding; the **${f.pct(s.validation.werNormalized)}** validation figure above uses ${s.model.beams}-beam decoding.`,
      tableCols: ['Step', 'Epoch', 'Greedy WER', 'CER', 'Raw WER', 'Eval loss'],
    },
    rerank: {
      title: 'Picking the checkpoint with beam search',
      takeaway: (s, f) =>
        `The ${f.int(s.rerank.length)} best checkpoints were re-scored with ${s.model.beams}-beam decoding; ${s.selectedRerank.checkpoint} has the lowest WER (${f.pct(s.selectedRerank.wer)}).`,
      selected: 'Chosen',
      delta: (r, f) =>
        r.selected ? 'Reference' : `${signedPp(r.deltaVsSelected, f)} vs the chosen checkpoint`,
      note: (s, f) =>
        `This is where the ${f.pct(s.validation.werNormalized)} validation figure comes from. The checkpoints differ very little, so the bars look almost equal.`,
      tableCols: ['Checkpoint', 'WER (5-beam)', 'Raw WER', 'CER'],
    },
  },

  regions: {
    heading: (s, f) => `Three regions, ${f.int(s.provinceCount)} provinces`,
    intro: (s, f) =>
      `Test-set results split by the speaker's region and by ${f.int(s.provinceCount)} provinces.`,
    bars: {
      title: 'WER by region',
      takeaway: (s, f) =>
        `${regionLong[s.hardestRegion]} is the hardest (${f.pct(s.regions[s.hardestRegion].wer)}), ${regionLong[s.easiestRegion]} the easiest (${f.pct(s.regions[s.easiestRegion].wer)}).`,
      tableCols: ['Region', 'WER', 'Utterances', 'Provinces'],
    },
    facts: {
      title: 'Numbers worth noting',
      items: [
        {
          label: () => 'Lowest-WER province',
          value: (s, f) => `${name(s.best.id)} — ${f.pct(s.best.wer)} (n = ${f.int(s.best.utterances)})`,
        },
        {
          label: () => 'Highest-WER province',
          value: (s, f) => `${name(s.worst.id)} — ${f.pct(s.worst.wer)} (n = ${f.int(s.worst.utterances)})`,
        },
        {
          label: (s, f) => `Of the ${f.int(s.hardest.items.length)} hardest provinces`,
          value: (s, f) => `${f.int(s.hardest.inHardestRegion)} are in ${regionLong[s.hardestRegion]}`,
        },
        {
          label: (s) => `Median province, ${regionLong[s.hardestRegion]}`,
          value: (s, f) => f.pct(s.regions[s.hardestRegion].provinceMedian),
        },
        {
          label: (s, f) => `Median of all ${f.int(s.provinceCount)} provinces`,
          value: (s, f) => f.pct(s.provinceMedian),
        },
        {
          label: () => 'Sample size per province',
          value: (s, f) =>
            `only ${f.int(s.provinceN.min)}–${f.int(s.provinceN.max)} utterances — read with the sample size`,
        },
      ],
    },
    ranking: {
      title: 'Province ranking',
      takeaway: (s, f) =>
        `Rank 1 has the lowest WER. Shared scale 0–${f.pct(SCALES.provinces, 0)}; each province has only ${f.int(s.provinceN.min)}–${f.int(s.provinceN.max)} utterances.`,
      filterLabel: 'Filter by region',
      all: 'All',
      row: (p) => `Rank ${p.rank}. ${p.name} — ${p.region} — WER ${p.wer} — ${p.n}`,
      showAll: (n, f) => `Show all ${f.int(n)} provinces`,
      showFewer: 'Show fewer',
      announce: (count, filter, f) =>
        filter === 'all'
          ? `Showing all ${f.int(count)} provinces.`
          : `Showing ${f.int(count)} provinces in ${regionLong[filter]}.`,
    },
    footnote: (s, f) =>
      `${f.int(s.provinceCount)} provinces as labelled in ViMD, i.e. before Vietnam's 2025 administrative merger.`,
  },

  errors: {
    heading: 'Where does the model go wrong?',
    intro:
      'Most utterances have only a few wrong words; a small number of very bad ones pull the average up.',
    histogram: {
      title: 'WER of individual utterances',
      takeaway: (s, f) =>
        `${f.int(s.distribution.perfectCount)} utterances (${f.pct(s.distribution.perfectRate)}) are perfect; half of all utterances have a WER below ${f.pct(s.distribution.median)}.`,
      axis: 'WER range per utterance (the ranges have unequal widths)',
      perfect: 'perfect',
      bin: (label, count, share, f) => `WER ${label}%: ${f.int(count)} utterances (${f.pct(share, 1)})`,
      tableCols: ['WER range', 'Utterances', 'Share'],
    },
    stats: {
      title: 'Summary',
      median: {
        label: 'Median',
        value: (s, f) => f.pct(s.distribution.median),
        sub: () => 'Half of the utterances score below this',
      },
      p90: {
        label: '90th percentile',
        value: (s, f) => f.pct(s.distribution.p90),
        sub: () => '9 in 10 utterances score at or below this',
      },
      perfect: {
        label: 'Perfect utterances',
        value: (s, f) => f.pct(s.distribution.perfectRate),
        sub: (s, f) => `${f.int(s.distribution.perfectCount)} utterances without a single wrong word`,
      },
      high: {
        label: 'Badly recognised',
        value: (s, f) => f.pct(s.distribution.highRate),
        sub: (s, f) => `WER of ${f.pct(s.distribution.highThreshold, 0)} or more`,
      },
    },
    over100: {
      title: 'Why can WER exceed 100%?',
      body: (s, f) =>
        `WER also counts inserted words. When the model gets stuck in a loop — repeating one phrase over and over — it can insert more words than the reference has, pushing WER past 100%. The worst utterance below has a WER of ${f.pct(s.maxExampleWer, 1)}.`,
    },
    worst: {
      title: 'The highest-error utterances',
      intro: (s, f) =>
        `The ${f.int(s.examples.length)} test utterances with the highest WER. The Vietnamese text is quoted exactly as in the data, typos included.`,
      cols: { index: '#', province: 'Province', duration: 'Duration', wer: 'WER', compare: 'Compare' },
      compare: 'Compare',
      compareFor: (e) => `utterance ${e.index}`,
      reference: 'Reference (human transcript)',
      prediction: 'What the model heard',
      showFull: 'Show verbatim',
      showShort: 'Shorten',
      repeat: (count, f) => `repeated ${f.int(count)} times`,
      repeatNote:
        'Consecutive repeated phrases are merged into one label with the repeat count (×). Choose “Show verbatim” to see the text exactly as in the data.',
    },
  },

  dataset: {
    heading: 'Data and training',
    intro: (s, f) =>
      `ViMD has ${f.int(s.splitTotals.utterances)} utterances (${f.num(s.splitTotals.hours)} hours) from speakers in ${f.int(s.provinceCount)} provinces, pre-split into three sets.`,
    splits: {
      title: 'The three splits',
      cols: ['Split', 'Utterances', 'Hours', 'Speakers', `Over ${WHISPER_WINDOW_SEC} s`],
      total: 'Total',
      notSummed: 'Not summed: a speaker may appear in more than one split',
      note: (s, f) =>
        `Whisper hears at most ${f.int(WHISPER_WINDOW_SEC)} seconds per clip, so ${f.int(s.splitTotals.over30s)} longer clips were cut to their first ${f.int(WHISPER_WINDOW_SEC)} seconds.`,
      trainUsed: (s, f) =>
        `Training used ${f.int(s.recipe.trainUtterancesUsed)} train utterances (${f.int(s.recipe.trainUtterancesDropped)} dropped).`,
    },
    recipe: {
      title: 'Training recipe',
      items: [
        { label: 'Base model', value: (s) => s.model.id },
        {
          label: 'Learning rate',
          value: (s, f) =>
            `${sci(s.recipe.learningRate, f)}, “${s.recipe.lrScheduler}” schedule, ${f.int(s.recipe.warmupSteps)} warm-up steps`,
        },
        {
          label: 'Effective batch',
          value: (s, f) =>
            `${f.int(s.recipe.effectiveBatchSize)} (${f.int(s.recipe.perDeviceBatchSize)} × ${f.int(s.recipe.gradientAccumulationSteps)} gradient-accumulation steps)`,
        },
        {
          label: 'Epochs',
          value: (s, f) =>
            `up to ${f.int(s.recipe.maxEpochs)}; early stopping after ${f.int(s.recipe.earlyStoppingPatience)} evaluations without improvement`,
        },
        { label: 'Evaluation', value: (s, f) => `every ${f.int(s.recipe.evalSteps)} steps` },
        {
          label: 'SpecAugment',
          value: (s, f) =>
            s.recipe.specAugment
              ? `on (time masking: probability ${f.numFlex(s.recipe.maskTimeProb)}, length ${f.int(s.recipe.maskTimeLength)})`
              : 'off',
        },
        {
          label: 'Weight decay · gradient clipping',
          value: (s, f) => `${f.numFlex(s.recipe.weightDecay)} · ${f.numFlex(s.recipe.maxGradNorm)}`,
        },
        { label: 'Numbers written as words', value: (s) => (s.recipe.expandNumbers ? 'yes' : 'no') },
        {
          label: 'Final decoding',
          value: (s, f) => `${s.model.beams}-beam, up to ${f.int(s.recipe.maxLabelTokens)} tokens`,
        },
        { label: 'Seed', value: (s, f) => f.int(s.recipe.seed) },
        {
          label: 'Run time',
          value: (s, f) => {
            const { start, end, spanMinutes, runtimeHours } = s.run
            const train = `${f.num(runtimeHours, 1)} h of training`
            if (!start || !end || spanMinutes === null) return train
            return `${runDate(start, 'en')} → ${runDate(end, 'en')} (${spanText(spanMinutes, 'en', f)}); ${train}`
          },
        },
      ],
    },
    environment: {
      title: 'Compute environment',
      items: [
        { label: 'GPU', value: (s, f) => `${s.environment.gpu} (${f.num(s.environment.gpuVramGb, 1)} GB)` },
        { label: 'CUDA · cuDNN', value: (s) => `${s.environment.cuda} · ${s.environment.cudnnVersion}` },
        { label: 'PyTorch', value: (s) => s.environment.torchVersion },
        { label: 'Transformers', value: (s) => s.environment.transformers },
        { label: 'Python', value: (s) => s.environment.python },
        {
          label: 'Hardware support',
          value: (s) =>
            `BF16 ${s.environment.bf16 ? 'supported' : 'unsupported'} · TF32 ${s.environment.tf32 ? 'available' : 'unavailable'}`,
        },
      ],
    },
    normalization: {
      title: 'Text normalization before scoring',
      intro:
        'WER is computed on both the raw and the normalized text. The headline figure uses the normalized text.',
      raw: 'Raw',
      rawRule: 'Unicode NFC and whitespace collapsing only.',
      normalized: 'Normalized',
      rules: {
        'Unicode NFC': { text: 'Unicode NFC' },
        'lowercase (diacritics preserved)': { text: 'Lower case, diacritics kept' },
        'canonical Vietnamese tone placement (hoà = hòa, thuý = thúy)': {
          text: 'Canonical Vietnamese tone-mark placement',
          sample: 'hoà = hòa, thuý = thúy',
        },
        "% expanded to 'phan tram'": { text: '% written out as a word', sample: '% → phần trăm' },
        'digit sequences expanded to Vietnamese number words': {
          text: 'Digits written out as Vietnamese number words',
        },
        'punctuation and symbols replaced by spaces': { text: 'Punctuation and symbols replaced by spaces' },
        'whitespace collapsed': { text: 'Whitespace collapsed' },
      },
    },
  },

  team: {
    heading: 'The team',
    team: (team) => `Team ${team}`,
    intro: 'A non-commercial student research project.',
    mentor: 'Mentor',
    members: 'Members',
  },

  credits: {
    heading: 'Credits and licences',
    intro: 'This site builds on the works below. Many thanks to their authors.',
    licence: 'Licence',
    noLicence: 'Licence not yet stated',
    source: 'Source',
    cite: 'Citation',
    nonCommercial:
      'This is a non-commercial educational project. The ViMD dataset is licensed CC BY-NC-ND 4.0: no commercial use and no distribution of modified versions.',
    report: 'Full technical report',
  },
}
