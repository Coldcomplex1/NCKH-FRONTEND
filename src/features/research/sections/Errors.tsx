import { Lightbulb, SearchX } from 'lucide-react'
import { ChartFigure, Histogram } from '@/components/charts'
import { Rich } from '../components/Rich'
import { Section, Sticker } from '../components/Section'
import { StatTile } from '../components/StatTile'
import { WorstExamples } from '../components/WorstExamples'
import { useResearch } from '../useResearch'

/** The per-utterance WER distribution, summary stats, the ">100%" callout and the worst examples. */
export function Errors() {
  const { t, f, s } = useResearch()
  const e = t.errors
  const d = s.distribution
  const max = Math.max(...d.bins.map((b) => b.count))
  const tiles = [e.stats.median, e.stats.p90, e.stats.perfect, e.stats.high]
  return (
    <Section
      id="errors"
      tone="soft"
      title={e.heading}
      intro={e.intro}
      icon={<SearchX className="size-7" />}
      tint="primary"
    >
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <ChartFigure
          title={e.histogram.title}
          takeaway={e.histogram.takeaway(s, f)}
          table={{
            columns: e.histogram.tableCols,
            rows: d.bins.map((b, i) => [
              i === 0 ? `${b.label}% (${e.histogram.perfect})` : `${b.label}%`,
              f.int(b.count),
              f.pct(b.share, 1),
            ]),
          }}
        >
          <Histogram
            max={max}
            axisLabel={e.histogram.axis}
            bins={d.bins.map((b, i) => ({
              key: b.label,
              label: `${b.label}%`,
              count: b.count,
              valueText: f.int(b.count),
              note: i === 0 ? e.histogram.perfect : undefined,
              srText: `${e.histogram.bin(b.label, b.count, b.share, f)}${i === 0 ? ` (${e.histogram.perfect})` : ''}`,
              tone: i === 0 ? 'success' : 'series-1',
            }))}
          />
        </ChartFigure>

        <div className="grid content-start gap-4">
          <h3 className="sr-only">{e.stats.title}</h3>
          <dl className="m-0 grid gap-4 sm:grid-cols-2">
            {tiles.map((c) => (
              <StatTile key={c.label} size="md" label={c.label} value={c.value(s, f)} sub={c.sub(s, f)} />
            ))}
          </dl>
          <aside className="flex gap-4 rounded-lg border-2 border-sun bg-sun-soft p-5">
            <Sticker icon={<Lightbulb className="size-7" />} tint="sun" className="bg-surface" />
            <div>
              <h3 className="mt-0 mb-1 font-display text-lg font-extrabold">{e.over100.title}</h3>
              <p className="m-0">
                <Rich text={e.over100.body(s, f)} />
              </p>
            </div>
          </aside>
        </div>
      </div>

      <WorstExamples className="mt-6" />
    </Section>
  )
}
