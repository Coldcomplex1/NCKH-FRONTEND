import { ChevronDown } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { provinceName } from '@/content/provinces'
import type { ExampleStat } from '@/content/stats'
import { Disclosure } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useIsWideLayout } from '@/lib/hooks'
import { collapseRepeats, tokenize, truncateSegments, type Segment } from '../lib/collapseRepeats'
import { useResearch } from '../useResearch'
import { RegionChip } from './RegionMark'

/** Words shown before "show verbatim" (a collapsed repeat counts as its unit). */
export const MAX_WORDS = 60

/** The highest-WER test utterances: a table on wide screens, cards on narrow ones. */
export function WorstExamples({ className }: { className?: string }) {
  const { t, f, s } = useResearch()
  const w = t.errors.worst
  const wide = useIsWideLayout()
  return (
    <div className={cn('rounded-lg border-2 border-line bg-surface p-5 shadow-soft sm:p-6', className)}>
      <h3 className="m-0 font-display text-xl font-extrabold">{w.title}</h3>
      <p className="mt-1 mb-5 text-muted">{w.intro(s, f)}</p>
      {wide ? (
        <table className="w-full border-collapse text-base">
          <caption className="sr-only">{w.title}</caption>
          <thead>
            <tr className="border-b-2 border-line-strong text-left">
              <th scope="col" className="px-3 py-2 font-bold">
                {w.cols.index}
              </th>
              <th scope="col" className="px-3 py-2 font-bold">
                {w.cols.province}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-bold">
                {w.cols.duration}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-bold">
                {w.cols.wer}
              </th>
              <th scope="col" className="px-3 py-2 font-bold">
                {w.cols.compare}
              </th>
            </tr>
          </thead>
          <tbody>
            {s.examples.map((e) => (
              <ExampleRows key={e.index} e={e} />
            ))}
          </tbody>
        </table>
      ) : (
        <ol className="m-0 grid list-none gap-4 p-0">
          {s.examples.map((e) => (
            <ExampleCard key={e.index} e={e} />
          ))}
        </ol>
      )}
      <p className="mt-4 mb-0 text-sm text-muted">{w.repeatNote}</p>
    </div>
  )
}

function ProvinceCell({ e }: { e: ExampleStat }) {
  const { t, lang } = useResearch()
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-semibold">{provinceName(e.province, lang)}</span>
      <RegionChip region={e.region} label={t.common.region[e.region]} />
    </span>
  )
}

function ExampleRows({ e }: { e: ExampleStat }) {
  const { t, f } = useResearch()
  const w = t.errors.worst
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <>
      <tr className={cn('align-middle', !open && 'border-b border-line')}>
        <th scope="row" className="px-3 py-2 text-left font-bold tabular-nums">
          {f.int(e.index)}
        </th>
        <td className="px-3 py-2">
          <ProvinceCell e={e} />
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{t.common.seconds(e.durationSec, f)}</td>
        <td className="px-3 py-2 text-right font-bold tabular-nums">{f.pct(e.wer, 1)}</td>
        <td className="px-3 py-2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((o) => !o)}
            className="inline-flex min-h-11 items-center gap-2 rounded-md font-semibold text-primary underline-offset-4 hover:underline"
          >
            <ChevronDown
              aria-hidden="true"
              className={cn('size-5 transition-transform', open && 'rotate-180')}
            />
            {w.compare}
            <span className="sr-only"> {w.compareFor(e)}</span>
          </button>
        </td>
      </tr>
      <tr id={id} hidden={!open} className="border-b border-line">
        <td colSpan={5} className="px-3 pb-4">
          {open ? <Compare e={e} /> : null}
        </td>
      </tr>
    </>
  )
}

function ExampleCard({ e }: { e: ExampleStat }) {
  const { t, f } = useResearch()
  const w = t.errors.worst
  return (
    <li className="rounded-lg border-2 border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-display text-lg font-extrabold tabular-nums">
          {w.cols.index}
          {f.int(e.index)}
        </span>
        <ProvinceCell e={e} />
      </div>
      <dl className="m-0 mt-2 flex flex-wrap gap-x-6 gap-y-1">
        <div className="flex gap-2">
          <dt className="text-muted">{w.cols.duration}</dt>
          <dd className="m-0 tabular-nums">{t.common.seconds(e.durationSec, f)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted">{w.cols.wer}</dt>
          <dd className="m-0 font-bold tabular-nums">{f.pct(e.wer, 1)}</dd>
        </div>
      </dl>
      <Disclosure
        className="mt-2"
        summary={
          <>
            {w.compare}
            <span className="sr-only"> {w.compareFor(e)}</span>
          </>
        }
      >
        <Compare e={e} />
      </Disclosure>
    </li>
  )
}

interface Prepared {
  segments: Segment[]
  truncated: boolean
  /** The shortened view differs from the verbatim text (repeats collapsed or words cut). */
  differs: boolean
}

function prepare(text: string): Prepared {
  const all = collapseRepeats(tokenize(text), { maxN: 4, minRun: 5 })
  const { segments, truncated } = truncateSegments(all, MAX_WORDS)
  return { segments, truncated, differs: truncated || all.some((x) => x.kind === 'repeat') }
}

/** Reference vs prediction side by side; loops collapse to pills, long text is cut at MAX_WORDS. */
function Compare({ e }: { e: ExampleStat }) {
  const { t } = useResearch()
  const w = t.errors.worst
  const [verbatim, setVerbatim] = useState(false)
  const ref = useMemo(() => prepare(e.reference), [e.reference])
  const pred = useMemo(() => prepare(e.prediction), [e.prediction])
  const differs = ref.differs || pred.differs
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <TextBlock title={w.reference} text={e.reference} view={ref} verbatim={verbatim} />
        <TextBlock title={w.prediction} text={e.prediction} view={pred} verbatim={verbatim} />
      </div>
      {differs ? (
        <button
          type="button"
          aria-pressed={verbatim}
          onClick={() => setVerbatim((v) => !v)}
          className="inline-flex min-h-11 w-fit items-center rounded-md px-1 font-semibold text-primary underline underline-offset-4"
        >
          {verbatim ? w.showShort : w.showFull}
        </button>
      ) : null}
    </div>
  )
}

function TextBlock({
  title,
  text,
  view,
  verbatim,
}: {
  title: string
  text: string
  view: Prepared
  verbatim: boolean
}) {
  return (
    <div className="min-w-0 rounded-md bg-surface-2 p-3">
      <p className="m-0 mb-1 font-bold">{title}</p>
      <p lang="vi" className="m-0 break-words">
        {verbatim ? text : <Segments segments={view.segments} />}
        {!verbatim && view.truncated ? ' …' : null}
      </p>
    </div>
  )
}

function Segments({ segments }: { segments: Segment[] }) {
  const { t, f, lang } = useResearch()
  return (
    <>
      {segments.map((seg, i) => {
        const lead = i > 0 ? ' ' : ''
        if (seg.kind === 'text') return <span key={i}>{lead + seg.tokens.join(' ')}</span>
        return (
          <span key={i}>
            {lead}
            <span className="inline-flex items-baseline gap-1 rounded-full border-2 border-accent bg-accent-soft px-2 font-semibold whitespace-nowrap">
              <span>{seg.unit.join(' ')}</span>
              <span aria-hidden="true" className="tabular-nums">
                ×{f.int(seg.count)}
              </span>
              <span className="sr-only" lang={lang}>
                ({t.errors.worst.repeat(seg.count, f)})
              </span>
            </span>
          </span>
        )
      })}
    </>
  )
}
