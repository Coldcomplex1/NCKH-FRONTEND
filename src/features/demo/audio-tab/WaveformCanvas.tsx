import { useRef } from 'react'
import { useWaveform } from '@/audio/useWaveform'
import { useDict } from '@/i18n'
import { audioDict } from './dict'

/**
 * Live waveform of the microphone while recording (decorative). With reduced motion it shows a
 * simple level bar instead of the moving line.
 */
export function WaveformCanvas({
  stream,
  reducedMotion,
}: {
  stream: MediaStream | null
  reducedMotion: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const level = useWaveform(stream, canvasRef, { draw: !reducedMotion })
  const t = useDict(audioDict).record

  if (reducedMotion) {
    return (
      <div aria-hidden="true" className="w-full">
        <p className="mb-1 text-sm text-muted">{t.level}</p>
        <div className="h-4 w-full overflow-hidden rounded-full border-2 border-ink bg-surface-2">
          <div className="h-full bg-primary" style={{ width: `${Math.round(level * 100)}%` }} />
        </div>
      </div>
    )
  }
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="block h-24 w-full rounded-lg border-2 border-line bg-surface-2 text-primary"
    />
  )
}
