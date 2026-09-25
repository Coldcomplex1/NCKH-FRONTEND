import { useEffect, useState, type RefObject } from 'react'

/**
 * Live microphone visualisation: MediaStreamAudioSourceNode → AnalyserNode (fftSize 2048), read with
 * getByteTimeDomainData every animation frame and drawn on a devicePixelRatio-scaled canvas.
 *
 * The AudioContext uses the DEFAULT sample rate: forcing 16 kHz makes Firefox refuse to connect a
 * mic stream recorded at another rate. With `draw: false` (reduced motion) nothing is drawn and the
 * hook only reports a smoothed 0–1 level (~10×/s) for a simple level bar.
 * The hook never stops the stream's tracks — the recorder owns them.
 */
export function useWaveform(
  stream: MediaStream | null,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  opts: { draw: boolean },
): number {
  const [level, setLevel] = useState(0)
  const { draw } = opts

  useEffect(() => {
    if (!stream) return
    const AC: typeof AudioContext | undefined =
      typeof window === 'undefined'
        ? undefined
        : (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    if (!AC) return

    let ctx: AudioContext
    let source: MediaStreamAudioSourceNode
    let analyser: AnalyserNode
    try {
      ctx = new AC()
      source = ctx.createMediaStreamSource(stream)
      analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      source.connect(analyser)
      void ctx.resume().catch(() => {})
    } catch {
      return
    }

    const data = new Uint8Array(analyser.fftSize)
    const canvas = canvasRef.current
    const g = draw && canvas ? canvas.getContext('2d') : null
    // Colour from CSS (`text-primary` on the canvas) so it follows the theme.
    const stroke = canvas ? getComputedStyle(canvas).color || '#5134d4' : '#5134d4'
    let raf = 0
    let lastLevelAt = 0
    let smoothed = 0

    const frame = (t: number) => {
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) {
        const v = ((data[i] ?? 128) - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / data.length)
      smoothed = Math.max(rms, smoothed * 0.85)
      if (g && canvas) drawWave(g, canvas, data, stroke)
      if (t - lastLevelAt > 100) {
        lastLevelAt = t
        setLevel(Math.min(1, smoothed * 4))
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      try {
        source.disconnect()
      } catch {
        /* ignore */
      }
      void ctx.close().catch(() => {})
      if (g && canvas) g.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [stream, canvasRef, draw])

  // No stream → silent (derived, not stored, so a stale level never shows).
  return stream ? level : 0
}

function drawWave(g: CanvasRenderingContext2D, canvas: HTMLCanvasElement, data: Uint8Array, stroke: string) {
  const dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2)
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (!w || !h) return
  const pw = Math.round(w * dpr)
  const ph = Math.round(h * dpr)
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw
    canvas.height = ph
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, w, h)
  g.lineWidth = 3
  g.lineJoin = 'round'
  g.lineCap = 'round'
  g.strokeStyle = stroke
  g.beginPath()
  // ~1 point per 2 CSS px is plenty and keeps low-end devices cool.
  const points = Math.max(2, Math.floor(w / 2))
  const step = data.length / points
  for (let i = 0; i < points; i++) {
    const v = ((data[Math.floor(i * step)] ?? 128) - 128) / 128
    const x = (i / (points - 1)) * w
    const y = h / 2 + v * (h / 2 - 4)
    if (i === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
  }
  g.stroke()
}
