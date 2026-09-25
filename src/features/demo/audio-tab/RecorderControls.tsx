import { CircleAlert, LoaderCircle, Mic, Square, X } from 'lucide-react'
import type { RecorderApi } from '@/audio/useRecorder'
import { Button } from '@/components/ui'
import { useDict } from '@/i18n'
import { cn } from '@/lib/cn'
import { formatCountdown } from '../format'
import { audioDict } from './dict'
import { WaveformCanvas } from './WaveformCanvas'

/** The 96px+ microphone button, 0:07 / 0:30 timer with progress, cancel, waveform and errors. */
export function RecorderControls({ rec, reducedMotion }: { rec: RecorderApi; reducedMotion: boolean }) {
  const t = useDict(audioDict).record
  const recording = rec.state === 'recording'
  const requesting = rec.state === 'requesting'
  const now = formatCountdown(Math.floor(rec.elapsedMs / 1000))
  const max = formatCountdown(rec.maxMs / 1000)
  const progress = Math.min(1, rec.elapsedMs / rec.maxMs)

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => (recording ? rec.stop() : void rec.start())}
        disabled={requesting}
        aria-label={recording ? t.stopLabel : t.start}
        className={cn(
          'grid size-24 place-items-center rounded-full border-2 border-ink shadow-pop transition-transform duration-150 active:translate-y-0.5 disabled:opacity-60',
          recording ? 'bg-danger text-white' : 'bg-primary text-on-primary hover:bg-primary-hover',
        )}
      >
        {requesting ? (
          <LoaderCircle aria-hidden="true" className="size-10 animate-spin" />
        ) : recording ? (
          <Square aria-hidden="true" className="size-9 fill-current" />
        ) : (
          <Mic aria-hidden="true" className="size-11" />
        )}
      </button>
      <p className="font-display text-xl font-extrabold text-ink" aria-hidden="true">
        {requesting ? t.requesting : recording ? t.stop : t.start}
      </p>

      {recording ? (
        <div className="flex w-full flex-col items-center gap-2">
          <p className="font-display text-2xl font-extrabold text-ink tabular-nums">
            <span aria-hidden="true">{t.elapsed(now, max)}</span>
            <span className="sr-only">{t.elapsedLabel(now, max)}</span>
          </p>
          <div
            aria-hidden="true"
            className="h-3 w-full max-w-xs overflow-hidden rounded-full border-2 border-ink bg-surface-2"
          >
            <div className="h-full bg-danger" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <WaveformCanvas stream={rec.stream} reducedMotion={reducedMotion} />
          <Button
            variant="secondary"
            icon={<X className="size-5" />}
            onClick={rec.cancel}
            aria-label={t.cancelLabel}
          >
            {t.cancel}
          </Button>
        </div>
      ) : null}

      {rec.state === 'error' && rec.error ? (
        <p className="flex items-start gap-2 rounded-lg border-2 border-danger bg-danger-soft p-3 text-base text-ink">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger" />
          {t.errors[rec.error]}
        </p>
      ) : null}

      {!recording ? <p className="text-center text-sm text-muted">{t.hint}</p> : null}
    </div>
  )
}
