import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { starPath } from './marks'
import { linear } from './scale'
import { useElementSize } from './useElementSize'

export interface LinePoint {
  key: string
  x: number
  y: number
  /** A distinct shape for annotated points (explained by the caller's marker legend). */
  marker?: 'star' | 'square'
}

export interface Tick {
  value: number
  label: string
}

const M = { top: 20, right: 24, bottom: 40, left: 64 }
const TICK_FONT = 16 // px — never scaled: the SVG renders at real pixel size.

/**
 * Single-series line chart in real pixels (ResizeObserver), so labels stay 16px at every width.
 * The SVG is one `role="img"` with a title/desc summary; the data points are HTML buttons laid over it
 * (≥ 48px hit areas, one tab stop with ←/→/Home/End roving focus) that drive a polite live detail line.
 */
export function LineChart({
  points,
  xDomain,
  yDomain,
  xTicks,
  yTicks,
  title,
  desc,
  pointLabel,
  detail,
  initialIndex = 0,
  className,
  children,
}: {
  points: LinePoint[]
  xDomain: [number, number]
  yDomain: [number, number]
  xTicks: Tick[]
  yTicks: Tick[]
  /** Accessible name of the SVG picture. */
  title: string
  /** One-paragraph text summary of the picture. */
  desc: string
  /** Accessible name of each point button. */
  pointLabel(p: LinePoint, index: number): string
  /** The detail line for the active point (rendered in an aria-live region). */
  detail(p: LinePoint, index: number): ReactNode
  initialIndex?: number
  className?: string
  /** Rendered between the plot and the detail line (e.g. a marker legend). */
  children?: ReactNode
}) {
  const [wrapRef, size] = useElementSize<HTMLDivElement>({ width: 640, height: 0 })
  const [active, setActive] = useState(() => Math.min(Math.max(initialIndex, 0), points.length - 1))
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const titleId = useId()
  const descId = useId()

  const width = Math.max(200, Math.round(size.width))
  const height = width < 480 ? 240 : 300
  const x = linear(xDomain, [M.left, width - M.right])
  const y = linear(yDomain, [height - M.bottom, M.top])

  // Thin the x ticks when they would crowd (each label needs ~56px at 16px).
  const plotW = width - M.left - M.right
  const every = plotW / Math.max(1, xTicks.length - 1) < 56 ? 2 : 1
  const shownX = xTicks.filter((_, i) => i % every === 0 || i === xTicks.length - 1)

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ')
  const cur = points[active]

  const focusPoint = (i: number) => {
    const next = (i + points.length) % points.length
    setActive(next)
    buttons.current[next]?.focus()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const moves: Record<string, number> = {
      ArrowRight: i + 1,
      ArrowUp: i + 1,
      ArrowLeft: i - 1,
      ArrowDown: i - 1,
      Home: 0,
      End: points.length - 1,
    }
    const to = moves[e.key]
    if (to === undefined) return
    e.preventDefault()
    focusPoint(to)
  }

  return (
    <div className={className}>
      <div ref={wrapRef} className="relative w-full" style={{ height }}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-labelledby={`${titleId} ${descId}`}
          className="absolute inset-0 block overflow-visible"
        >
          <title id={titleId}>{title}</title>
          <desc id={descId}>{desc}</desc>

          {/* Recessive solid hairline grid + y tick labels. */}
          {yTicks.map((t) => (
            <g key={t.value}>
              <line
                x1={M.left}
                x2={width - M.right}
                y1={y(t.value)}
                y2={y(t.value)}
                className="stroke-line"
                strokeWidth={1}
              />
              <text
                x={M.left - 10}
                y={y(t.value)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted tabular-nums"
                style={{ fontSize: TICK_FONT }}
              >
                {t.label}
              </text>
            </g>
          ))}
          {shownX.map((t) => (
            <text
              key={t.value}
              x={x(t.value)}
              y={height - M.bottom + 26}
              textAnchor="middle"
              className="fill-muted tabular-nums"
              style={{ fontSize: TICK_FONT }}
            >
              {t.label}
            </text>
          ))}

          {/* Crosshair at the active point. */}
          {cur ? (
            <line
              x1={x(cur.x)}
              x2={x(cur.x)}
              y1={M.top}
              y2={height - M.bottom}
              className="stroke-line-strong"
              strokeWidth={1}
            />
          ) : null}

          <path
            d={path}
            fill="none"
            className="stroke-series-1"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {points.map((p, i) => (
            <PointMark key={p.key} cx={x(p.x)} cy={y(p.y)} marker={p.marker} active={i === active} />
          ))}
        </svg>

        {/* Keyboard/touch targets, one per point (48px), positioned over the SVG. */}
        {points.map((p, i) => (
          <button
            key={p.key}
            ref={(el) => {
              buttons.current[i] = el
            }}
            type="button"
            tabIndex={i === active ? 0 : -1}
            aria-pressed={i === active}
            aria-label={pointLabel(p, i)}
            onClick={() => setActive(i)}
            onFocus={() => setActive(i)}
            onMouseEnter={() => setActive(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className="absolute size-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent"
            style={{ left: x(p.x), top: y(p.y) }}
          />
        ))}
      </div>

      {children}

      <p aria-live="polite" className="mt-3 mb-0 min-h-[3.3em] rounded-md bg-surface-2 px-3 py-2 text-base">
        {cur ? detail(cur, active) : null}
      </p>
    </div>
  )
}

function PointMark({
  cx,
  cy,
  marker,
  active,
}: {
  cx: number
  cy: number
  marker?: 'star' | 'square'
  active: boolean
}) {
  // 2px surface ring keeps marks legible where they cross the line.
  const ring = 'stroke-surface'
  if (marker === 'star') {
    return (
      <path
        d={starPath(cx, cy, active ? 12 : 10, active ? 5.5 : 4.5)}
        className={cn('fill-ink', ring)}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    )
  }
  if (marker === 'square') {
    const s = active ? 16 : 13
    return (
      <rect
        x={cx - s / 2}
        y={cy - s / 2}
        width={s}
        height={s}
        rx={2}
        className={cn('fill-ink', ring)}
        strokeWidth={2}
      />
    )
  }
  return <circle cx={cx} cy={cy} r={active ? 7 : 5} className={cn('fill-series-1', ring)} strokeWidth={2} />
}
