import { useState } from 'react'
import { ChartFigure, clamp } from '@/components/charts'
import type { RegionFilter } from '@/content/research'
import { provinceName } from '@/content/provinces'
import { REGIONS, SCALES } from '@/content/stats'
import type { MacroRegion } from '@/core/parser'
import { Button, SegmentedControl } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useResearch } from '../useResearch'
import { RegionChip } from './RegionMark'

/** Rows shown on narrow screens before "show all" (wide screens always show every row, in 3 columns). */
export const MOBILE_ROWS = 15

const BAR: Record<MacroRegion, string> = { North: 'bg-north', Central: 'bg-central', South: 'bg-south' }

/**
 * All provinces ranked by WER (rank 1 = lowest). Each row is a complete sentence for screen readers
 * (the visual row is aria-hidden); region = text chip + shape + colour; filter changes are announced.
 */
export function ProvinceRanking({ className }: { className?: string }) {
  const { t, f, s, lang } = useResearch()
  const c = t.regions.ranking
  const [filter, setFilter] = useState<RegionFilter>('all')
  const [expanded, setExpanded] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  const rows = filter === 'all' ? s.provinces : s.provinces.filter((p) => p.region === filter)
  const overflow = rows.length > MOBILE_ROWS

  const onFilter = (next: RegionFilter) => {
    setFilter(next)
    setExpanded(false)
    const count = next === 'all' ? s.provinces.length : s.provinces.filter((p) => p.region === next).length
    setAnnouncement(c.announce(count, next, f))
  }

  return (
    <ChartFigure
      className={className}
      title={c.title}
      takeaway={c.takeaway(s, f)}
      footnote={t.regions.footnote(s, f)}
    >
      <SegmentedControl<RegionFilter>
        label={c.filterLabel}
        value={filter}
        onChange={onFilter}
        className="mb-5 flex-wrap"
        options={[
          { value: 'all', label: c.all },
          ...REGIONS.map((r) => ({ value: r, label: t.common.region[r] })),
        ]}
      />
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <ol className="m-0 list-none p-0 lg:columns-3 lg:gap-8">
        {rows.map((p, i) => {
          const name = provinceName(p.id, lang)
          const wer = f.pct(p.wer)
          const n = t.common.n(p.utterances, f)
          const frac = clamp(p.wer / SCALES.provinces, 0, 1)
          return (
            <li
              key={p.id}
              className={cn(
                'break-inside-avoid border-b border-line py-2',
                i >= MOBILE_ROWS && !expanded && 'max-lg:hidden',
              )}
            >
              <span className="sr-only">
                {c.row({ rank: p.rank, name, region: t.common.region[p.region], wer, n })}
              </span>
              <div aria-hidden="true">
                <div className="flex items-baseline gap-2">
                  <span className="w-8 shrink-0 text-right font-bold text-muted tabular-nums">
                    {f.int(p.rank)}
                  </span>
                  <span className="min-w-0 flex-1 font-semibold break-words">{name}</span>
                  <span className="font-bold tabular-nums">{wer}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 ps-10">
                  <RegionChip region={p.region} label={t.common.region[p.region]} />
                  <span className="flex h-3 min-w-0 flex-1 items-center">
                    <span
                      className={cn('block h-3 rounded-e-[4px]', BAR[p.region])}
                      style={{ width: `${frac * 100}%`, minWidth: frac > 0 ? 2 : 0 }}
                    />
                  </span>
                  <span className="text-sm whitespace-nowrap text-muted tabular-nums">{n}</span>
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      {overflow ? (
        <Button className="mt-4 lg:hidden" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
          {expanded ? c.showFewer : c.showAll(rows.length, f)}
        </Button>
      ) : null}
    </ChartFigure>
  )
}
