import { AlarmClock, CircleHelp, Frown, Volume2, type LucideIcon } from 'lucide-react'
import type { ReplyTone } from '@/core/replies'
import { useDict, useLang } from '@/i18n'
import { cn } from '@/lib/cn'
import { renderReply } from '@/replies'
import { useDemo } from '@/store/demoStore'
import { demoDict } from '../dict'

const TONES: Record<ReplyTone, { box: string; icon?: LucideIcon; iconClass?: string }> = {
  normal: { box: 'bg-surface' },
  question: { box: 'bg-sun-soft', icon: CircleHelp, iconClass: 'text-accent-ink' },
  sorry: { box: 'bg-primary-soft', icon: Frown, iconClass: 'text-primary' },
  alert: { box: 'bg-danger-soft', icon: AlarmClock, iconClass: 'text-danger' },
}

/**
 * The robot's sticker-style speech bubble (top-left of the robot panel). It stays until the next
 * reply replaces it and is re-rendered from its ReplyRef, so switching VI/EN translates it.
 * aria-hidden: screen readers get the same text once through the LiveRegion.
 */
export function SpeechBubble() {
  const bubble = useDemo((s) => s.bubble)
  const lang = useLang()
  const t = useDict(demoDict).robot
  if (!bubble) return null

  const text = renderReply(bubble.ref, lang).text
  const tone = TONES[bubble.tone] ?? TONES.normal
  const Icon = tone.icon

  return (
    <div
      key={bubble.id}
      aria-hidden="true"
      className={cn(
        'pointer-events-auto relative max-w-full animate-pop-in rounded-xl border-2 border-ink px-4 py-3 text-ink shadow-pop sm:px-5 sm:py-4',
        tone.box,
      )}
    >
      <div className="mb-1 flex items-center gap-2 text-sm font-bold text-primary">
        <span className="font-display">{t.botName}</span>
        {bubble.speaking ? (
          <span className="inline-flex items-center gap-1 text-muted">
            <Volume2 className="size-4" />
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="inline-block size-1.5 animate-dot rounded-full bg-current"
                style={{ animationDelay: `${i * 160}ms` }}
              />
            ))}
          </span>
        ) : null}
      </div>
      <p className="flex items-start gap-2 text-base leading-snug font-semibold text-pretty sm:text-lg lg:text-xl">
        {Icon ? <Icon className={cn('mt-1 size-6 shrink-0', tone.iconClass)} /> : null}
        <span>{text}</span>
      </p>
      {/* Tail, pointing down toward the robot. */}
      <span
        className={cn(
          'absolute -bottom-[9px] left-10 size-4 rotate-45 border-r-2 border-b-2 border-ink',
          tone.box,
        )}
      />
    </div>
  )
}
