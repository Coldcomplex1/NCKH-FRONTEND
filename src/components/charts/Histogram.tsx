import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { clamp } from './scale'
import { TONE_BG, type Tone } from './tones'

export interface HistogramBin {
  key: string
  /** Category label under the column (the bins may be unequal, so they are categories, not an axis). */
  label: ReactNode
  count: number
  /** Always-visible text on the column cap (e.g. "647"). */
  valueText: ReactNode
  /** Extra text for the list item (e.g. "hoàn hảo"), shown under the label. */
  note?: ReactNode
  /** Full sentence for screen readers, e.g. "WER 0–5%: 647 câu". */
  srText: string
  tone?: Tone
}

/**
 * Vertical HTML/CSS columns for categorical bins on a shared 0…`max` count scale. Each bin is a list
 * item with a complete text alternative; the columns themselves are decorative.
 */
export function Histogram({
  bins,
  max,
  height = 200,
  axisLabel,
  className,
}: {
  bins: HistogramBin[]
  max: number
  /** Plot height in px (columns only; labels sit below). */
  height?: number
  /** Caption under the category labels, e.g. "WER của từng câu (%)". */
  axisLabel?: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <ul
        className="m-0 grid list-none gap-1 p-0"
        style={{ gridTemplateColumns: `repeat(${bins.length}, minmax(0, 1fr))` }}
      >
        {bins.map((b) => {
          const frac = max > 0 ? clamp(b.count / max, 0, 1) : 0
          return (
            <li key={b.key} className="flex min-w-0 flex-col items-center text-center">
              <span className="sr-only">{b.srText}</span>
              <div
                aria-hidden="true"
                className="flex w-full flex-col items-center justify-end"
                style={{ height }}
              >
                <span className="mb-1 font-semibold tabular-nums">{b.valueText}</span>
                <span
                  className={cn('w-full max-w-12 rounded-t-[4px]', TONE_BG[b.tone ?? 'series-1'])}
                  style={{ height: `calc((100% - 1.9rem) * ${frac})`, minHeight: frac > 0 ? 2 : 0 }}
                />
              </div>
              <div aria-hidden="true" className="w-full border-t-2 border-line-strong pt-1">
                <div className="font-semibold tabular-nums">{b.label}</div>
                {b.note ? <div className="text-sm text-muted">{b.note}</div> : null}
              </div>
            </li>
          )
        })}
      </ul>
      {axisLabel ? <p className="mt-2 mb-0 text-center text-sm text-muted">{axisLabel}</p> : null}
    </div>
  )
}
