import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type SectionTone = 'plain' | 'soft'
export type StickerTint = 'primary' | 'sun' | 'accent' | 'success'

const TINT: Record<StickerTint, string> = {
  primary: 'bg-primary-soft text-primary',
  sun: 'bg-sun-soft text-warning',
  accent: 'bg-accent-soft text-accent-ink',
  success: 'bg-success-soft text-success',
}

/** A rounded "sticker" holding a decorative icon. */
export function Sticker({
  icon,
  tint = 'primary',
  className,
}: {
  icon: ReactNode
  tint?: StickerTint
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-12 shrink-0 items-center justify-center rounded-2xl',
        TINT[tint],
        className,
      )}
    >
      {icon}
    </span>
  )
}

/**
 * One research sub-section: a full-width band (alternating soft backgrounds) with a centred ~72rem
 * column, a display-font h2 and an optional intro line.
 */
export function Section({
  id,
  title,
  intro,
  icon,
  tint,
  tone = 'plain',
  children,
}: {
  id: string
  title: ReactNode
  intro?: ReactNode
  icon?: ReactNode
  tint?: StickerTint
  tone?: SectionTone
  children: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn('px-4 py-14 sm:py-20 lg:px-6', tone === 'soft' ? 'bg-surface-2' : 'bg-bg')}
    >
      <div className="mx-auto max-w-[72rem]">
        <header className="mb-8 max-w-3xl sm:mb-10">
          {icon ? <Sticker icon={icon} tint={tint} className="mb-4" /> : null}
          <h2 id={`${id}-title`} className="m-0 font-display text-3xl font-black sm:text-4xl">
            {title}
          </h2>
          {intro ? <p className="mt-3 mb-0 text-lg text-muted">{intro}</p> : null}
        </header>
        {children}
      </div>
    </section>
  )
}

/** A soft-pop card with an optional h3. */
export function Panel({
  title,
  children,
  className,
  dashed = false,
}: {
  title?: ReactNode
  children: ReactNode
  className?: string
  dashed?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-lg border-2 bg-surface p-5 shadow-soft sm:p-6',
        dashed ? 'border-dashed border-line-strong' : 'border-line',
        className,
      )}
    >
      {title ? <h3 className="mt-0 mb-4 font-display text-xl font-extrabold">{title}</h3> : null}
      {children}
    </div>
  )
}
