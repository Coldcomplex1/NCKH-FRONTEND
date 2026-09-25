import { CircleAlert, FileUp, LoaderCircle, Scissors, X } from 'lucide-react'
import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { decodeAudio } from '@/audio/decode'
import { FILE_ACCEPT, MAX_AUDIO_SECONDS, MIN_AUDIO_SECONDS, validateFile } from '@/audio/validateFile'
import { Button } from '@/components/ui'
import { useDict, useFmt } from '@/i18n'
import { ENV } from '@/lib/env'
import { cn } from '@/lib/cn'
import { audioDict } from './dict'

export interface ChosenFile {
  file: File
  /** Seconds, or null when the browser cannot decode it (the original is uploaded as-is). */
  durationSec: number | null
  /** true when the user accepted "use the first 30 s". */
  trimmed: boolean
}

/**
 * Drag-and-drop or "Chọn tệp". Checks the whitelist and size (≤ VITE_ASR_MAX_UPLOAD_MB) first, then
 * decodes to learn the duration: < 0.5 s is rejected, > 30 s offers "use the first 30 s".
 */
export function FileDropzone({ onChosen }: { onChosen(chosen: ChosenFile): void }) {
  const t = useDict(audioDict).file
  const fmt = useFmt()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tooLong, setTooLong] = useState<{ file: File; durationSec: number } | null>(null)
  const maxMB = ENV.asr.maxUploadMB

  const handle = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setTooLong(null)
    const check = validateFile(file, maxMB)
    if (!check.ok) {
      setError(check.problem === 'size' ? `${t.errors.size} ${t.sizeLimit(maxMB)}` : t.errors[check.problem])
      return
    }
    setChecking(true)
    const decoded = await decodeAudio(file)
    setChecking(false)
    const durationSec = decoded ? decoded.duration : null
    if (durationSec !== null && durationSec < MIN_AUDIO_SECONDS) {
      setError(t.tooShort)
      return
    }
    if (durationSec !== null && durationSec > MAX_AUDIO_SECONDS) {
      setTooLong({ file, durationSec })
      return
    }
    onChosen({ file, durationSec, trimmed: false })
  }

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    void handle(e.target.files?.[0])
    e.target.value = '' // choosing the same file again still fires change
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    void handle(e.dataTransfer.files?.[0])
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-5 text-center transition-colors duration-150',
          dragging ? 'border-primary bg-primary-soft' : 'border-line-strong bg-surface-2',
        )}
      >
        <FileUp aria-hidden="true" className="size-8 text-muted" />
        <p className="text-base font-semibold text-ink">{t.drop}</p>
        <p className="text-sm text-muted">{t.or}</p>
        <Button
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          disabled={checking}
          icon={checking ? <LoaderCircle className="size-5 animate-spin" /> : <FileUp className="size-5" />}
        >
          {checking ? t.checking : t.choose}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={FILE_ACCEPT}
          onChange={onInput}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
        />
        <p className="text-sm text-muted">{t.hint(maxMB)}</p>
      </div>

      {error ? (
        <p className="flex items-start gap-2 rounded-lg border-2 border-danger bg-danger-soft p-3 text-base text-ink">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger" />
          {error}
        </p>
      ) : null}

      {tooLong ? (
        <div className="flex flex-col gap-3 rounded-lg border-2 border-warning bg-sun-soft p-3">
          <p className="text-base text-ink">{t.tooLong(fmt.numFlex(tooLong.durationSec, 1))}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              icon={<Scissors className="size-5" />}
              onClick={() => {
                const { file } = tooLong
                setTooLong(null)
                onChosen({ file, durationSec: MAX_AUDIO_SECONDS, trimmed: true })
              }}
            >
              {t.useFirst}
            </Button>
            <Button icon={<X className="size-5" />} onClick={() => setTooLong(null)}>
              {t.cancel}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
