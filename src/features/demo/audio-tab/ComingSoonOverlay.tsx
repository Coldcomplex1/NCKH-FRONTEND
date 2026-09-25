import { Keyboard, Mic } from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import { useDict } from '@/i18n'
import { audioDict } from './dict'

/** Sits over the (inert) audio UI until VITE_ASR_URL is configured. */
export function ComingSoonOverlay({ onSwitchToText }: { onSwitchToText(): void }) {
  const t = useDict(audioDict).soon
  return (
    <div
      data-testid="audio-coming-soon"
      className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-surface/80 p-4 backdrop-blur-[2px]"
    >
      <div className="flex max-w-md flex-col items-center gap-3 rounded-xl border-2 border-ink bg-surface p-5 text-center shadow-pop sm:p-6">
        <span className="grid size-16 place-items-center rounded-full border-2 border-ink bg-sun-soft">
          <Mic aria-hidden="true" className="size-8 text-ink" />
        </span>
        <Badge tone="sun">{t.badge}</Badge>
        <h2 className="font-display text-2xl font-extrabold text-ink">{t.title}</h2>
        <p className="text-base text-ink">{t.body}</p>
        <Button variant="primary" size="lg" icon={<Keyboard className="size-6" />} onClick={onSwitchToText}>
          {t.switchToText}
        </Button>
      </div>
    </div>
  )
}
