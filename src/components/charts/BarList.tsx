import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { clamp } from './scale'
import { TONE_BG, type Tone } from './tones'

export interface BarDatum {
  key: string
  label: ReactNode
  /** null = no measurement yet: a dashed "ghost" stub is drawn and `valueText` should say so. */
  value: number | null
  /** Always-visible value text at the bar tip (e.g. "7,84%"). */
  valueText: ReactNode
  tone?: Tone
  /** Small leading mark before the label (e.g. a region shape). */
  marker?: ReactNode
  /** Secondary text under the label (e.g. "n = 783"). */
  note?: ReactNode
  /** Draws the label bold (the selected / highlighted row; pair it with a text note, never colour alone). */
  emphasis?: boolean
}

/**
 * Horizontal HTML/CSS bars on a fixed 0…`max` scale shared by all rows. Each row is a list item whose
 * text reads completely (label, value, note); the bar itself is decorative (aria-hidden).
 * The bar width is a share of (track − `valueSpace`) so the value text always fits at the tip.
 */
export function BarList({
  data,
  max,
  valueSpace = 6,
  labelWidth = 'sm:grid-cols-[minmax(9rem,15rem)_1fr]',
  className,
  label,
}: {
  data: BarDatum[]
  max: number
  /** Room reserved right of the longest bar for its value text, in rem. */
  valueSpace?: number
  /** Tailwind grid template for label | bar on wider screens. */
  labelWidth?: string
  className?: string
  /** Accessible name of the list. */
  label?: string
}) {
  return (
    <ul aria-label={label} className={cn('m-0 flex list-none flex-col gap-3 p-0', className)}>
      {data.map((d) => (
        <li key={d.key} className={cn('grid grid-cols-1 items-center gap-x-4 gap-y-1', labelWidth)}>
          <div className="flex min-w-0 items-start gap-2">
            {d.marker ? <span className="mt-1 inline-flex shrink-0">{d.marker}</span> : null}
            <div className="min-w-0">
              <div className={cn('leading-snug', d.emphasis ? 'font-bold' : 'font-semibold')}>{d.label}</div>
              {d.note ? <div className="text-sm text-muted">{d.note}</div> : null}
            </div>
          </div>
          <BarTrack value={d.value} max={max} valueSpace={valueSpace} tone={d.tone}>
            {d.valueText}
          </BarTrack>
        </li>
      ))}
    </ul>
  )
}

/** One bar + its tip value. Exported for GroupedBars and the province ranking. */
export function BarTrack({
  value,
  max,
  valueSpace = 6,
  tone = 'series-1',
  children,
  size = 'md',
}: {
  value: number | null
  max: number
  valueSpace?: number
  tone?: Tone
  children: ReactNode
  size?: 'sm' | 'md'
}) {
  const frac = value === null || !(max > 0) ? 0 : clamp(value / max, 0, 1)
  const h = size === 'sm' ? 'h-3.5' : 'h-5'
  return (
    <div className="flex min-w-0 items-center">
      {value === null ? (
        <span
          aria-hidden="true"
          className={cn('w-10 shrink-0 rounded-e-sm border-2 border-dashed border-line-strong', h)}
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'shrink-0 rounded-e-[4px] motion-safe:transition-[width] motion-safe:duration-400',
            h,
            TONE_BG[tone],
          )}
          // Width is a share of the track minus the value gutter, identical across rows → comparable.
          style={{ width: `calc((100% - ${valueSpace}rem) * ${frac})`, minWidth: frac > 0 ? 2 : 0 }}
        />
      )}
      <span className="ms-2 font-semibold whitespace-nowrap tabular-nums">{children}</span>
    </div>
  )
}
