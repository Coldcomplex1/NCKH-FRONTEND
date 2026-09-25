import { Calculator, Trophy } from 'lucide-react'
import { BarList, ChartFigure, niceMax, type BarDatum } from '@/components/charts'
import { Disclosure } from '@/components/ui'
import { Rich } from '../components/Rich'
import { Panel, Section } from '../components/Section'
import { StatTile } from '../components/StatTile'
import { useResearch } from '../useResearch'

/** Four headline tiles, the "What is WER?" explainer and — only when measured — the comparison bars. */
export function Results() {
  const { t, f, s } = useResearch()
  const r = t.results
  const tiles = [
    { key: 'wer', c: r.wer, lower: true },
    { key: 'cer', c: r.cer, lower: true },
    { key: 'size', c: r.size, lower: false },
    { key: 'coverage', c: r.coverage, lower: false },
  ]
  return (
    <Section
      id="results"
      title={r.heading}
      intro={r.intro(s, f)}
      icon={<Trophy className="size-7" />}
      tint="sun"
    >
      <dl className="m-0 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(({ key, c, lower }) => (
          <StatTile
            key={key}
            label={c.label}
            value={c.value(s, f)}
            unit={c.unit}
            sub={c.sub(s, f)}
            lowerIsBetter={lower ? t.common.lowerIsBetter : undefined}
          />
        ))}
      </dl>

      <Panel className="mt-6">
        <Disclosure
          summary={
            <span className="inline-flex items-center gap-2 text-lg">
              <Calculator aria-hidden="true" className="size-5" />
              {r.what.summary}
            </span>
          }
        >
          <div className="grid gap-3">
            <p className="m-0 inline-block w-fit rounded-md bg-primary-soft px-4 py-2 font-display text-xl font-extrabold">
              {r.what.formula}
            </p>
            <p className="m-0 text-muted">{r.what.legend}</p>
            <p className="m-0">{r.what.body(s, f)}</p>
            <p className="m-0">{r.what.raw(s, f)}</p>
          </div>
        </Disclosure>
      </Panel>

      {s.comparison.show ? <Comparison /> : null}
    </Section>
  )
}

/** Rendered only when comparisons.ts holds at least one measured value — never with invented numbers. */
function Comparison() {
  const { t, f, s } = useResearch()
  const c = t.results.comparison
  const rows: BarDatum[] = []
  if (s.comparison.zeroShot !== null) {
    rows.push({
      key: 'zero',
      label: c.zeroShot,
      value: s.comparison.zeroShot,
      valueText: f.pct(s.comparison.zeroShot),
      tone: 'muted',
    })
  }
  rows.push({
    key: 'ours',
    label: c.ours,
    value: s.comparison.ours,
    valueText: f.pct(s.comparison.ours),
    tone: 'series-1',
    emphasis: true,
  })
  rows.push({
    key: 'qwen',
    label: c.qwen,
    value: s.comparison.qwen,
    valueText: s.comparison.qwen === null ? t.common.soon : f.pct(s.comparison.qwen),
    tone: 'series-2',
  })
  const max = niceMax(Math.max(...rows.map((d) => d.value ?? 0)))
  return (
    <ChartFigure
      className="mt-6"
      title={c.title}
      takeaway={<Rich text={c.takeaway(s, f)} />}
      footnote={`${t.common.lowerIsBetter}. ${t.common.scale(max, f)}.`}
      table={{
        columns: c.tableCols,
        rows: rows.map((d) => [d.label, d.valueText]),
      }}
    >
      <BarList data={rows} max={max} label={c.title} />
    </ChartFigure>
  )
}
