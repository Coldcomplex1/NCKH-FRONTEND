import { AlarmClock, BellRing, X } from 'lucide-react'
import { engine } from '@/engine'
import { useDict } from '@/i18n'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/demoStore'
import { demoDict } from '../dict'
import { formatCountdown } from '../format'
import { useNow } from '../useNow'

/**
 * Active timers (top-right of the robot panel). The countdown is recomputed from `endsAt` every
 * second, so it stays right after background-tab throttling. Cancel → `engine.cancelTimer(id)`.
 */
export function TimerPill() {
  const timers = useDemo((s) => s.timers)
  const t = useDict(demoDict).timer
  const now = useNow(timers.length > 0)
  if (timers.length === 0) return null

  return (
    <ul aria-label={t.label} className="pointer-events-auto flex flex-col items-end gap-2">
      {timers.map((timer) => {
        const left = formatCountdown((timer.endsAt - now) / 1000)
        const ringing = !!timer.ringing || timer.endsAt <= now
        return (
          <li
            key={timer.id}
            className={cn(
              'flex animate-pop-in items-center gap-2 rounded-full border-2 py-1 pr-1 pl-3 shadow-pop',
              ringing ? 'border-danger bg-danger-soft text-ink' : 'border-ink bg-surface text-ink',
            )}
          >
            {ringing ? (
              <BellRing aria-hidden="true" className="size-6 text-danger" />
            ) : (
              <AlarmClock aria-hidden="true" className="size-6 text-primary" />
            )}
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-muted">
                {timer.label ? `${t.label} · ${timer.label}` : t.label}
              </span>
              <span className="font-display text-xl font-extrabold tabular-nums">
                {ringing ? t.ringing : left}
              </span>
            </span>
            <button
              type="button"
              onClick={() => engine.cancelTimer(timer.id)}
              aria-label={ringing ? t.dismiss : t.cancel(left)}
              className="inline-flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-surface text-ink hover:bg-surface-2"
            >
              <X aria-hidden="true" className="size-6" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
