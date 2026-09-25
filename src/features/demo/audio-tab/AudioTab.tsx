import { CircleAlert, CircleCheck, FlaskConical, LoaderCircle, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useRecorder } from '@/audio/useRecorder'
import { Badge, Button } from '@/components/ui'
import { useDict, useLang } from '@/i18n'
import { ENV } from '@/lib/env'
import { usePrefersReducedMotion } from '@/lib/hooks'
import { renderReply } from '@/replies'
import { submitAudio, type AsrSettled } from '../pipeline'
import { errorRef } from '../turnErrors'
import { AudioPreview } from './AudioPreview'
import { ComingSoonOverlay } from './ComingSoonOverlay'
import { audioDict } from './dict'
import { FileDropzone, type ChosenFile } from './FileDropzone'
import { RecorderControls } from './RecorderControls'

/**
 * The voice tab. Always BUILT; until VITE_ASR_URL is set (or the dev mock is on) the whole panel is
 * `inert` (nothing inside can be focused or clicked) under a "Sắp có" overlay.
 */
export function AudioTab({ live, onSwitchToText }: { live: boolean; onSwitchToText(): void }) {
  if (live) return <AudioPanel />
  return (
    <div className="relative min-h-[28rem]">
      <div inert className="select-none" data-testid="audio-inert">
        <AudioPanel />
      </div>
      <ComingSoonOverlay onSwitchToText={onSwitchToText} />
    </div>
  )
}

type Notice = { kind: 'done' } | { kind: 'error'; code: string | undefined } | null

interface Pending {
  blob: Blob
  source: 'mic' | 'file'
  durationSec: number | null
  trimmed: boolean
}

function AudioPanel() {
  const t = useDict(audioDict)
  const lang = useLang()
  const reducedMotion = usePrefersReducedMotion()
  const rec = useRecorder({ onStart: () => setNotice(null) })
  const [file, setFile] = useState<ChosenFile | null>(null)
  const [processing, setProcessing] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const controllerRef = useRef<AbortController | null>(null)

  const pending: Pending | null = file
    ? { blob: file.file, source: 'file', durationSec: file.durationSec, trimmed: file.trimmed }
    : rec.state === 'recorded' && rec.recording
      ? { blob: rec.recording.blob, source: 'mic', durationSec: rec.recording.durationSec, trimmed: false }
      : null

  const clearPending = () => {
    setFile(null)
    rec.reset()
  }

  const send = () => {
    if (!pending) return
    const controller = new AbortController()
    controllerRef.current = controller
    setProcessing(true)
    setNotice(null)
    const settle = (r: AsrSettled) => {
      if (controllerRef.current !== controller) return
      controllerRef.current = null
      setProcessing(false)
      if (r.ok) {
        setNotice({ kind: 'done' })
        clearPending()
      } else if (!r.cancelled) {
        setNotice({ kind: 'error', code: r.error })
      }
    }
    // submitAudio primes speech synchronously: keep it directly inside the click handler.
    void submitAudio(pending.blob, pending.source, { signal: controller.signal, onAsrSettled: settle }).then(
      (res) => {
        if (res.status === 'ignored') settle({ ok: false, cancelled: true })
      },
    )
  }

  const cancelProcessing = () => controllerRef.current?.abort()

  return (
    <div className="flex flex-col gap-5 rounded-xl border-2 border-ink bg-surface p-4 text-ink shadow-pop sm:p-5">
      {ENV.asr.mock && !ENV.asr.enabled ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <FlaskConical aria-hidden="true" className="size-5" />
          <Badge tone="muted">DEV</Badge>
          {t.mock}
        </p>
      ) : null}

      {processing ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <LoaderCircle aria-hidden="true" className="size-12 animate-spin text-primary" />
          <p className="font-display text-xl font-extrabold">{t.processing.label}</p>
          <p className="text-base text-muted">{t.processing.hint}</p>
          <Button icon={<X className="size-5" />} onClick={cancelProcessing}>
            {t.processing.cancel}
          </Button>
        </div>
      ) : pending ? (
        <AudioPreview
          blob={pending.blob}
          durationSec={pending.durationSec}
          trimmed={pending.trimmed}
          againLabel={pending.source === 'file' ? t.preview.otherFile : t.preview.again}
          onSend={send}
          onAgain={() => {
            const wasMic = pending.source === 'mic'
            clearPending()
            if (wasMic) void rec.start()
          }}
        />
      ) : (
        <>
          <section aria-labelledby="audio-record-title" className="flex flex-col gap-2">
            <h3 id="audio-record-title" className="font-display text-lg font-extrabold">
              {t.record.heading}
            </h3>
            <RecorderControls rec={rec} reducedMotion={reducedMotion} />
          </section>
          {rec.state !== 'recording' && rec.state !== 'requesting' ? (
            <section aria-labelledby="audio-file-title" className="flex flex-col gap-2">
              <h3 id="audio-file-title" className="font-display text-lg font-extrabold">
                {t.file.heading}
              </h3>
              <FileDropzone
                onChosen={(chosen) => {
                  setNotice(null)
                  setFile(chosen)
                }}
              />
            </section>
          ) : null}
        </>
      )}

      {notice?.kind === 'done' ? (
        <p className="flex items-start gap-2 rounded-lg border-2 border-success bg-success-soft p-3 text-base">
          <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
          {t.done}
        </p>
      ) : notice?.kind === 'error' ? (
        <p className="flex items-start gap-2 rounded-lg border-2 border-danger bg-danger-soft p-3 text-base">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger" />
          {renderReply(errorRef(notice.code), lang).text}
        </p>
      ) : null}
    </div>
  )
}
