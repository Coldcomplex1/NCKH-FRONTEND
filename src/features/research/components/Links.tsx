import { ExternalLink as ExternalIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

const BUTTON = {
  primary:
    'bg-primary text-on-primary shadow-[0_4px_0_var(--primary-hover)] hover:bg-primary-hover active:translate-y-0.5 active:shadow-[0_2px_0_var(--primary-hover)]',
  secondary: 'border-2 border-line-strong bg-surface text-ink hover:bg-surface-2',
} as const

/** An anchor styled like the shared Button (for in-page jumps and the report link). */
export function LinkButton({
  href,
  variant = 'secondary',
  icon,
  external,
  newTabText,
  children,
}: {
  href: string
  variant?: keyof typeof BUTTON
  icon?: ReactNode
  external?: boolean
  /** Screen-reader note for `external` links, e.g. "(mở thẻ mới)". */
  newTabText?: string
  children: ReactNode
}) {
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className={cn(
        'inline-flex min-h-13 items-center justify-center gap-2 rounded-xl px-6 text-lg font-bold no-underline transition-[transform,background-color,box-shadow] duration-150 select-none',
        BUTTON[variant],
      )}
    >
      {icon ? (
        <span aria-hidden="true" className="inline-flex shrink-0">
          {icon}
        </span>
      ) : null}
      {children}
      {external ? (
        <>
          <ExternalIcon aria-hidden="true" className="size-5 shrink-0" />
          {newTabText ? <span className="sr-only"> {newTabText}</span> : null}
        </>
      ) : null}
    </a>
  )
}

/** An inline text link that opens in a new tab. */
export function ExtLink({
  href,
  newTabText,
  children,
  className,
  lang,
}: {
  href: string
  newTabText: string
  children: ReactNode
  className?: string
  lang?: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex min-h-11 items-center gap-1 font-semibold text-primary underline underline-offset-4',
        className,
      )}
    >
      <span lang={lang}>{children}</span>
      <ExternalIcon aria-hidden="true" className="size-4 shrink-0" />
      <span className="sr-only"> {newTabText}</span>
    </a>
  )
}
