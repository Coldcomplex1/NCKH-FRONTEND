import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { BarTrack } from './BarList'
import { TONE_BG, type Tone } from './tones'

export interface GroupedSeries {
  key: string
  label: string
  tone: Tone
}

export interface BarGroup {
  key: string
  label: ReactNode
  /** One value per series key. */
  values: Record<string, { value: number; valueText: ReactNode }>
}

/**
 * Groups of horizontal bars (one bar per series) on a shared 0…`max` scale. Identity is never colour
 * alone: a legend sits above and every bar is also direct-labelled with its series name.
 */
export function GroupedBars({
  groups,
  series,
  max,
  valueSpace = 6,
  className,
}: {
  groups: BarGroup[]
  series: GroupedSeries[]
  max: number
  valueSpace?: number
  className?: string
}) {
  return (
    <div className={className}>
      {/* The legend repeats the direct labels, so it is hidden from screen readers. */}
      <ul aria-hidden="true" className="m-0 mb-4 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-base">
        {series.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-2">
            <span className={cn('inline-block size-4 rounded-[4px]', TONE_BG[s.tone])} />
            {s.label}
          </li>
        ))}
      </ul>
      <ul className="m-0 grid list-none gap-5 p-0">
        {groups.map((g) => (
          <li key={g.key}>
            <div className="mb-1.5 font-bold">{g.label}</div>
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {series.map((s) => {
                const v = g.values[s.key]
                if (!v) return null
                return (
                  <li
                    key={s.key}
                    className="grid grid-cols-[minmax(6.5rem,9rem)_1fr] items-center gap-x-3 text-base"
                  >
                    <span className="text-muted">{s.label}</span>
                    <BarTrack value={v.value} max={max} tone={s.tone} valueSpace={valueSpace}>
                      {v.valueText}
                    </BarTrack>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}
