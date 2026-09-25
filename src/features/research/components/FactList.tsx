import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Label/value pairs as a definition list (stacks on narrow screens). */
export function FactList({
  items,
  className,
}: {
  items: { label: ReactNode; value: ReactNode }[]
  className?: string
}) {
  return (
    <dl className={cn('m-0 grid gap-0', className)}>
      {items.map((it, i) => (
        <div
          key={i}
          className="grid gap-x-4 gap-y-0.5 border-b border-line py-2.5 last:border-b-0 sm:grid-cols-[minmax(9rem,2fr)_3fr]"
        >
          <dt className="font-semibold text-muted">{it.label}</dt>
          <dd className="m-0 min-w-0 break-words">{it.value}</dd>
        </div>
      ))}
    </dl>
  )
}
