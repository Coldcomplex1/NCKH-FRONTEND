import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'sun' | 'primary' | 'success' | 'muted' | 'danger'
const TONES: Record<Tone, string> = {
  sun: 'bg-sun text-[#1c1838]',
  primary: 'bg-primary-soft text-ink',
  success: 'bg-success-soft text-ink',
  muted: 'bg-surface-2 text-muted',
  danger: 'bg-danger-soft text-ink',
}

/** Non-interactive label, e.g. "Sắp có". */
export function Badge({
  tone = 'sun',
  children,
  className,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm leading-6 font-bold whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
