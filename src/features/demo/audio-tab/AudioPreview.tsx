import { RotateCcw, SendHorizontal } from 'lucide-react'
import { useCallback } from 'react'
import { Button } from '@/components/ui'
import { useDict, useFmt } from '@/i18n'
import { audioDict } from './dict'

/** Native <audio controls> of the recording/file, with "Gửi cho robot" and "Ghi lại". */
export function AudioPreview({
  blob,
  durationSec,
  trimmed,
  againLabel,
  onSend,
  onAgain,
}: {
  blob: Blob
  durationSec: number | null
  trimmed: boolean
  againLabel: string
  onSend(): void
  onAgain(): void
}) {
  const t = useDict(audioDict).preview
  const fmt = useFmt()
  // Object URL owned by the <audio> element's ref (React 19 ref cleanup revokes it).
  const attach = useCallback(
    (el: HTMLAudioElement | null) => {
      if (!el || typeof URL.createObjectURL !== 'function') return
      const url = URL.createObjectURL(blob)
      el.src = url
      return () => URL.revokeObjectURL(url)
    },
    [blob],
  )

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-display text-lg font-extrabold text-ink">{t.heading}</h3>
      {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- the user's own recording: no captions exist */}
      <audio ref={attach} controls aria-label={t.audioLabel} className="w-full" />
      {durationSec !== null ? (
        <p className="text-sm text-muted">{t.duration(fmt.numFlex(durationSec, 1))}</p>
      ) : null}
      {trimmed ? <p className="text-sm font-semibold text-ink">{t.trimmed}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="lg" icon={<SendHorizontal className="size-6" />} onClick={onSend}>
          {t.send}
        </Button>
        <Button size="lg" icon={<RotateCcw className="size-5" />} onClick={onAgain}>
          {againLabel}
        </Button>
      </div>
    </div>
  )
}
