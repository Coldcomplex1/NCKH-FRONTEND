import { cn } from '@/lib/cn'

export interface SegmentOption<T extends string> {
  value: T
  label: string
  /** Accessible name when the visible label is short (e.g. "VI"). */
  ariaLabel?: string
  lang?: string
}

/** A row of toggle buttons (aria-pressed). Used for VI|EN and filters. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = 'md',
}: {
  options: SegmentOption<T>[]
  value: T
  onChange(value: T): void
  label: string
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('inline-flex rounded-full border-2 border-line-strong bg-surface p-1', className)}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            aria-label={o.ariaLabel}
            lang={o.lang}
            onClick={() => onChange(o.value)}
            className={cn(
              // Both sizes share the same min-height: a shorter "sm" control used to dip below
              // the 48px minimum touch-target size.
              'min-h-11 rounded-full px-3 text-base font-bold transition-colors duration-150',
              size === 'sm' ? 'min-w-11' : undefined,
              active ? 'bg-primary text-on-primary' : 'text-ink hover:bg-surface-2',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
