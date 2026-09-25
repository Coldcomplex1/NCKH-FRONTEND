import type { MacroRegion } from '@/core/parser'
import { cn } from '@/lib/cn'

const FILL: Record<MacroRegion, string> = {
  North: 'fill-north',
  Central: 'fill-central',
  South: 'fill-south',
}
const INK: Record<MacroRegion, string> = {
  North: 'text-north-ink',
  Central: 'text-central-ink',
  South: 'text-south-ink',
}

/** Region shape (North ● circle, Central ▲ triangle, South ■ square) — identity is never colour alone. */
export function RegionShape({
  region,
  size = 14,
  className,
}: {
  region: MacroRegion
  size?: number
  className?: string
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 14 14"
      className={cn('inline-block shrink-0', FILL[region], className)}
    >
      {region === 'North' ? <circle cx="7" cy="7" r="6" /> : null}
      {region === 'Central' ? <path d="M7 1 13.2 12.6H.8Z" strokeLinejoin="round" /> : null}
      {region === 'South' ? <rect x="1.5" y="1.5" width="11" height="11" rx="2" /> : null}
    </svg>
  )
}

/** Text chip for a region: shape + name, the name in the region's AA text ink. */
export function RegionChip({
  region,
  label,
  className,
}: {
  region: MacroRegion
  label: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border-2 border-line bg-surface px-2.5 text-sm leading-7 font-bold whitespace-nowrap',
        className,
      )}
    >
      <RegionShape region={region} size={12} />
      <span className={INK[region]}>{label}</span>
    </span>
  )
}
