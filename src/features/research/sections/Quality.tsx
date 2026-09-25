import { Check, ShieldCheck } from 'lucide-react'
import {
  BarList,
  ChartFigure,
  GroupedBars,
  LineChart,
  niceDomain,
  niceMax,
  starPath,
  type BarGroup,
  type LinePoint,
} from '@/components/charts'
import { SCALES } from '@/content/stats'
import { Badge } from '@/components/ui'
import { Rich } from '../components/Rich'
import { Section } from '../components/Section'
import { useResearch } from '../useResearch'

/** Validation vs test, the greedy training curve and the 5-beam reranking. */
export function Quality() {
  const { t } = useResearch()
  const q = t.quality
  return (
    <Section
      id="quality"
      tone="soft"
      title={q.heading}
      intro={q.intro}
      icon={<ShieldCheck className="size-7" />}
      tint="success"
    >
      <div className="grid gap-6">
        <ValTest />
        <Trajectory />
        <Rerank />
      </div>
    </Section>
  )
}

function ValTest() {
  const { t, f, s } = useResearch()
  const c = t.quality.valTest
  const metrics = [
    { key: 'wer', label: c.metrics.wer, val: s.validation.werNormalized, test: s.test.werNormalized },
    { key: 'werRaw', label: c.metrics.werRaw, val: s.validation.werRaw, test: s.test.werRaw },
    { key: 'cer', label: c.metrics.cer, val: s.validation.cerNormalized, test: s.test.cerNormalized },
  ]
  const groups: BarGroup[] = metrics.map((m) => ({
    key: m.key,
    label: m.label,
    values: {
      validation: { value: m.val, valueText: f.pct(m.val) },
      test: { value: m.test, valueText: f.pct(m.test) },
    },
  }))
  return (
    <ChartFigure
      title={c.title}
      takeaway={c.takeaway(s, f)}
      footnote={
        <>
          {c.note(s, f)} {t.common.lowerIsBetter}. {t.common.scale(SCALES.valTest, f)}.
        </>
      }
      table={{
        columns: c.tableCols,
        rows: metrics.map((m) => [m.label, f.pct(m.val), f.pct(m.test)]),
      }}
    >
      <GroupedBars
        groups={groups}
        max={SCALES.valTest}
        series={[
          { key: 'validation', label: c.series.validation, tone: 'series-1' },
          { key: 'test', label: c.series.test, tone: 'series-2' },
        ]}
      />
    </ChartFigure>
  )
}

function Trajectory() {
  const { t, f, s } = useResearch()
  const c = t.quality.trajectory
  const pts = s.training.points
  const points: LinePoint[] = pts.map((p) => ({
    key: String(p.step),
    x: p.step,
    y: p.wer,
    marker: p.selected ? 'star' : p.bestGreedy ? 'square' : undefined,
  }))
  const ys = pts.map((p) => p.wer)
  const lo = Math.min(...ys)
  const hi = Math.max(...ys)
  const pad = (hi - lo) * 0.15
  const y = niceDomain(lo - pad, hi + pad, 3)
  const selectedIndex = Math.max(
    0,
    pts.findIndex((p) => p.selected),
  )
  const tag = (i: number) => {
    const p = pts[i]
    if (!p) return ''
    const tags = [p.selected ? c.selected(s, f) : '', p.bestGreedy ? c.bestGreedy : ''].filter(Boolean)
    return tags.length ? ` — ${tags.join(' · ')}` : ''
  }
  return (
    <ChartFigure
      title={c.title}
      takeaway={c.takeaway(s, f)}
      footnote={
        <p className="m-0">
          <Rich text={c.beamNote(s, f)} />
        </p>
      }
      table={{
        columns: c.tableCols,
        rows: pts.map((p) => [
          f.int(p.step),
          f.num(p.epoch, 1),
          f.pct(p.wer),
          f.pct(p.cer),
          f.pct(p.werRaw),
          f.num(p.evalLoss, 3),
        ]),
      }}
    >
      <LineChart
        points={points}
        xDomain={[pts[0]?.step ?? 0, pts[pts.length - 1]?.step ?? 1]}
        yDomain={y.domain}
        xTicks={pts.map((p) => ({ value: p.step, label: f.int(p.step) }))}
        yTicks={y.ticks.map((v) => ({ value: v, label: f.pct(v, 1) }))}
        title={c.svgTitle}
        desc={c.svgDesc(s, f)}
        initialIndex={selectedIndex}
        pointLabel={(_, i) => `${c.pointLabel(pts[i]!, f)}${tag(i)}`}
        detail={(_, i) => `${c.detail(pts[i]!, f)}${tag(i)}`}
      >
        <p className="mt-1 mb-0 text-center text-sm text-muted">{c.xLabel}</p>
        <ul className="m-0 mt-3 flex list-none flex-wrap gap-x-6 gap-y-1 p-0 text-base">
          <li className="inline-flex items-center gap-2">
            <svg aria-hidden="true" width="22" height="22" className="shrink-0">
              <path d={starPath(11, 11, 10, 4.5)} className="fill-ink" />
            </svg>
            {c.selected(s, f)}
          </li>
          <li className="inline-flex items-center gap-2">
            <svg aria-hidden="true" width="22" height="22" className="shrink-0">
              <rect x="4" y="4" width="14" height="14" rx="2" className="fill-ink" />
            </svg>
            {c.bestGreedy}
          </li>
        </ul>
        <p className="mt-2 mb-0 text-sm text-muted">{c.axisNote}</p>
      </LineChart>
    </ChartFigure>
  )
}

function Rerank() {
  const { t, f, s } = useResearch()
  const c = t.quality.rerank
  const rows = [...s.rerank].sort((a, b) => a.wer - b.wer)
  const max = niceMax(Math.max(...rows.map((r) => r.wer)))
  return (
    <ChartFigure
      title={c.title}
      takeaway={c.takeaway(s, f)}
      footnote={`${c.note(s, f)} ${t.common.scale(max, f)}.`}
      table={{
        columns: c.tableCols,
        rows: rows.map((r) => [
          r.selected ? `${r.checkpoint} (${c.selected})` : r.checkpoint,
          f.pct(r.wer),
          f.pct(r.werRaw),
          f.pct(r.cer),
        ]),
      }}
    >
      <BarList
        label={c.title}
        max={max}
        labelWidth="sm:grid-cols-[minmax(12rem,18rem)_1fr]"
        data={rows.map((r) => ({
          key: r.checkpoint,
          label: (
            <span className="inline-flex flex-wrap items-center gap-2">
              {r.checkpoint}
              {r.selected ? (
                <Badge tone="success">
                  <Check aria-hidden="true" className="size-4" />
                  {c.selected}
                </Badge>
              ) : null}
            </span>
          ),
          value: r.wer,
          valueText: f.pct(r.wer),
          tone: 'series-1',
          emphasis: r.selected,
          note: c.delta(r, f),
        }))}
      />
    </ChartFigure>
  )
}
