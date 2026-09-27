import { Keyboard, LoaderCircle, Mic, RotateCw, ServerOff } from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import { useDict } from '@/i18n'
import { audioDict } from './dict'

/**
 * Sits over the (inert) audio UI: "soon" until VITE_ASR_URL is configured, "offline" while the
 * configured backend does not answer (the team's GPU machine is off). Offline adds "Thử lại".
 */
export function ComingSoonOverlay({
  onSwitchToText,
  variant = 'soon',
  onRetry,
  retrying = false,
}: {
  onSwitchToText(): void
  variant?: 'soon' | 'offline'
  onRetry?(): void
  retrying?: boolean
}) {
  const dict = useDict(audioDict)
  const t = dict[variant]
  const offline = variant === 'offline'
  const Icon = offline ? ServerOff : Mic
  return (
    <div
      data-testid={offline ? 'audio-offline' : 'audio-coming-soon'}
      className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-surface/80 p-4 backdrop-blur-[2px]"
    >
      <div className="flex max-w-md flex-col items-center gap-3 rounded-xl border-2 border-ink bg-surface p-5 text-center shadow-pop sm:p-6">
        <span className="grid size-16 place-items-center rounded-full border-2 border-ink bg-sun-soft">
          <Icon aria-hidden="true" className="size-8 text-ink" />
        </span>
        <Badge tone={offline ? 'muted' : 'sun'}>{t.badge}</Badge>
        <h2 className="font-display text-2xl font-extrabold text-ink">{t.title}</h2>
        <p className="text-base text-ink">{t.body}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {offline && onRetry ? (
            <Button
              size="lg"
              disabled={retrying}
              icon={
                retrying ? <LoaderCircle className="size-6 animate-spin" /> : <RotateCw className="size-6" />
              }
              onClick={onRetry}
            >
              {retrying ? dict.offline.retrying : dict.offline.retry}
            </Button>
          ) : null}
          <Button variant="primary" size="lg" icon={<Keyboard className="size-6" />} onClick={onSwitchToText}>
            {t.switchToText}
          </Button>
        </div>
      </div>
    </div>
  )
}
