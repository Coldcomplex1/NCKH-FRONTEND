import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type ChipCategory = 'motion' | 'info' | 'chat' | 'home' | 'dialect' | 'limit' | 'neutral'

const CAT: Record<ChipCategory, string> = {
  motion: 'border-cat-motion bg-cat-motion-soft',
  info: 'border-cat-info bg-cat-info-soft',
  chat: 'border-cat-chat bg-cat-chat-soft',
  home: 'border-cat-home bg-cat-home-soft',
  dialect: 'border-cat-dialect bg-cat-dialect-soft',
  limit: 'border-cat-limit bg-cat-limit-soft',
  neutral: 'border-line-strong bg-surface',
}

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  category?: ChipCategory
  icon?: ReactNode
}

/** A pill button (example commands, suggestions). Always ≥ 50px tall. */
export function Chip({ category = 'neutral', icon, className, children, type, ...rest }: ChipProps) {
  return (
    <button
      type={type ?? 'button'}
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-4 py-1.5 text-left text-base font-medium text-ink transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50',
        CAT[category],
        className,
      )}
      {...rest}
    >
      {icon ? (
        <span aria-hidden="true" className="inline-flex shrink-0">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  )
}
