import { ArrowDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * A headline number. Render inside a `<dl>`: the label is the term, the value and its sub-line the
 * description. `lowerIsBetter` adds the direction note (text + icon, never colour alone).
 */
export function StatTile({
  label,
  value,
  unit,
  sub,
  lowerIsBetter,
  size = 'lg',
  className,
}: {
  label: ReactNode
  value: ReactNode
  unit?: ReactNode
  sub?: ReactNode
  lowerIsBetter?: string
  size?: 'lg' | 'md'
  className?: string
}) {
  return (
    <div
      className={cn('flex flex-col rounded-lg border-2 border-line bg-surface p-5 shadow-soft', className)}
    >
      <dt className="font-semibold text-muted">{label}</dt>
      <dd
        className={cn(
          'm-0 mt-1 font-display font-black tabular-nums',
          size === 'lg' ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl',
        )}
      >
        {value}
        {unit ? (
          <>
            {' '}
            <span className="text-xl font-extrabold sm:text-2xl">{unit}</span>
          </>
        ) : null}
      </dd>
      {sub ? <dd className="m-0 mt-1 text-muted">{sub}</dd> : null}
      {lowerIsBetter ? (
        <dd className="m-0 mt-auto inline-flex items-center gap-1.5 pt-3 text-sm font-semibold text-success">
          <ArrowDown aria-hidden="true" className="size-4" />
          {lowerIsBetter}
        </dd>
      ) : null}
    </div>
  )
}
