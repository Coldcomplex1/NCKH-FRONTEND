import { ChevronDown } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Accessible show/hide section (button + region). */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  className,
}: {
  summary: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 items-center gap-2 rounded-md font-semibold text-primary underline-offset-4 hover:underline"
      >
        <ChevronDown aria-hidden="true" className={cn('size-5 transition-transform', open && 'rotate-180')} />
        {summary}
      </button>
      <div id={id} hidden={!open} className="mt-2">
        {children}
      </div>
    </div>
  )
}
