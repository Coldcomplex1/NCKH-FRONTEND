import type { ExampleStat, RerankStat, SplitStat, Stats, TrainingPoint } from '@/content/stats'
import type { MacroRegion } from '@/core/parser'
import type { Fmt } from '@/i18n/format'

/**
 * Every sentence of the research section, per UI language. Anything that contains a number is a
 * function of the derived `stats` and the locale formatter — no figure is ever typed into the copy.
 * `**bold**` and `{{Vietnamese fragment}}` are the only markup (rendered by the research `Rich`
 * component); wrap a Vietnamese word/phrase quoted inside English copy in `{{…}}` so it gets
 * `lang="vi"` for screen readers.
 */
export type Line = (s: Stats, f: Fmt) => string

export type PipelineNodeId = 'input' | 'asr' | 'qwen' | 'nlu' | 'robot'
export type RegionFilter = 'all' | MacroRegion

/** A normalization rule; `sample` is a Vietnamese snippet (rendered with lang="vi"). */
export interface NormRule {
  text: string
  sample?: string
}

export interface FactItem {
  label: string
  value: Line
}

export interface TileCopy {
  label: string
  value: Line
  /** Unit shown smaller after the value ("câu", "provinces"). */
  unit?: string
  sub: Line
}

export interface ResearchCopy {
  /** Accessible name of the whole #research region. */
  label: string
  common: {
    region: Record<MacroRegion, string>
    /** "miền Trung" / "Central Vietnam" — used inside sentences. */
    regionLong: Record<MacroRegion, string>
    split: Record<SplitStat['name'], string>
    lowerIsBetter: string
    soon: string
    /** Screen-reader suffix for links that open a new tab. */
    newTab: string
    n(n: number, f: Fmt): string
    utterances(n: number, f: Fmt): string
    seconds(sec: number, f: Fmt): string
    /** Scale note under bar charts, e.g. "Thang đo chung 0–15%". */
    scale(max: number, f: Fmt): string
    yes: string
    no: string
  }
  overview: {
    eyebrow(team: string): string
    lede: Line
    mentor: string
    tryRobot: string
    seeResults: string
    fullReport: string
    otherTitle: string
  }
  problem: {
    heading: string
    intro: string
    access: { title: string; body: string }
    data: { title: string; body: Line; caveat: Line }
    goal: { title: string; body: Line }
  }
  pipeline: {
    heading: string
    intro: string
    more: string
    stepLabel(i: number, total: number): string
    nodes: Record<PipelineNodeId, { title: string; sub: Line; body: Line }>
  }
  results: {
    heading: string
    intro: Line
    wer: TileCopy
    cer: TileCopy
    size: TileCopy
    coverage: TileCopy
    what: { summary: string; formula: string; legend: string; body: Line; raw: Line }
    comparison: {
      title: string
      takeaway: Line
      zeroShot: string
      ours: string
      qwen: string
      tableCols: [string, string]
    }
  }
  quality: {
    heading: string
    intro: string
    valTest: {
      title: string
      takeaway: Line
      metrics: { wer: string; werRaw: string; cer: string }
      series: { validation: string; test: string }
      note: Line
      tableCols: [string, string, string]
    }
    trajectory: {
      title: string
      takeaway: Line
      xLabel: string
      axisNote: string
      svgTitle: string
      svgDesc: Line
      pointLabel(p: TrainingPoint, f: Fmt): string
      detail(p: TrainingPoint, f: Fmt): string
      selected: Line
      bestGreedy: string
      beamNote: Line
      tableCols: string[]
    }
    rerank: {
      title: string
      takeaway: Line
      selected: string
      delta(r: RerankStat, f: Fmt): string
      note: Line
      tableCols: string[]
    }
  }
  regions: {
    heading: Line
    intro: Line
    bars: { title: string; takeaway: Line; tableCols: string[] }
    facts: { title: string; items: { label: Line; value: Line }[] }
    ranking: {
      title: string
      takeaway: Line
      filterLabel: string
      all: string
      row(p: { rank: number; name: string; region: string; wer: string; n: string }): string
      showAll(n: number, f: Fmt): string
      showFewer: string
      announce(count: number, filter: RegionFilter, f: Fmt): string
    }
    footnote: Line
  }
  errors: {
    heading: string
    intro: string
    histogram: {
      title: string
      takeaway: Line
      axis: string
      perfect: string
      bin(label: string, count: number, share: number, f: Fmt): string
      tableCols: [string, string, string]
    }
    stats: {
      title: string
      median: TileCopy
      p90: TileCopy
      perfect: TileCopy
      high: TileCopy
    }
    over100: { title: string; body: Line }
    worst: {
      title: string
      intro: Line
      cols: { index: string; province: string; duration: string; wer: string; compare: string }
      compare: string
      compareFor(e: ExampleStat): string
      reference: string
      prediction: string
      showFull: string
      showShort: string
      repeat(count: number, f: Fmt): string
      repeatNote: string
    }
  }
  dataset: {
    heading: string
    intro: Line
    splits: {
      title: string
      cols: [string, string, string, string, string]
      total: string
      notSummed: string
      note: Line
      trainUsed: Line
    }
    recipe: { title: string; items: FactItem[] }
    environment: { title: string; items: FactItem[] }
    normalization: {
      title: string
      intro: string
      raw: string
      rawRule: string
      normalized: string
      rules: Record<string, NormRule>
    }
  }
  team: {
    heading: string
    team(team: string): string
    intro: string
    mentor: string
    members: string
  }
  credits: {
    heading: string
    intro: string
    licence: string
    noLicence: string
    source: string
    cite: string
    nonCommercial: string
    report: string
  }
}
