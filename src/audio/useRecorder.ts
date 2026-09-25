import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_AUDIO_SECONDS, MIN_AUDIO_SECONDS } from './validateFile'

/**
 * Microphone recording with MediaRecorder: mono, echo-cancelled, 250 ms chunks, auto-stop at 30 s,
 * recordings under 0.5 s rejected. All failure modes are mapped to a small set of kinds the UI can
 * explain in plain words (including in-app browsers such as Zalo/Facebook that block the mic).
 */

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'recorded' | 'error'

export type RecorderErrorKind =
  /** Permission denied (NotAllowedError / SecurityError). */
  | 'denied'
  /** No microphone (NotFoundError / OverconstrainedError). */
  | 'no_device'
  /** Microphone in use or hardware error (NotReadableError / AbortError). */
  | 'busy'
  /** Page not served over HTTPS (getUserMedia needs a secure context). */
  | 'insecure'
  /** No getUserMedia / MediaRecorder in this browser. */
  | 'unsupported'
  /** An in-app browser (Zalo, Facebook, Instagram…) that hides the microphone API. */
  | 'in_app'
  | 'too_short'
  | 'failed'

export interface Recording {
  blob: Blob
  durationSec: number
  mimeType: string
}

/** Preferred container/codec order: Chrome/Firefox → webm/opus, Firefox → ogg/opus, Safari → mp4. */
export const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/webm',
] as const

export function pickMimeType(
  isSupported: (type: string) => boolean = (t) =>
    typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
      ? MediaRecorder.isTypeSupported(t)
      : false,
): string | undefined {
  return MIME_CANDIDATES.find((t) => {
    try {
      return isSupported(t)
    } catch {
      return false
    }
  })
}

const IN_APP_UA =
  /\bZalo\b|FBAN|FBAV|FB_IAB|FBIOS|Instagram|\bLine\/|Messenger|MicroMessenger|TikTok|musical_ly/i

export function isInAppBrowser(userAgent: string): boolean {
  return IN_APP_UA.test(userAgent)
}

/** Environment problems that make recording impossible before even asking for permission. */
export function recorderSupport(
  env: {
    isSecureContext?: boolean
    hasGetUserMedia: boolean
    hasMediaRecorder: boolean
    userAgent: string
  } = {
    isSecureContext: typeof window !== 'undefined' ? window.isSecureContext : true,
    hasGetUserMedia: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
    hasMediaRecorder: typeof MediaRecorder !== 'undefined',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  },
): RecorderErrorKind | null {
  if (env.isSecureContext === false) return 'insecure'
  if (!env.hasGetUserMedia || !env.hasMediaRecorder) {
    return isInAppBrowser(env.userAgent) ? 'in_app' : 'unsupported'
  }
  return null
}

export function mapMediaError(err: unknown): RecorderErrorKind {
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : ''
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'no_device'
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy'
    case 'TypeError':
    case 'NotSupportedError':
      return 'unsupported'
    default:
      return 'failed'
  }
}

export interface RecorderApi {
  state: RecorderState
  error: RecorderErrorKind | null
  /** Milliseconds recorded so far (updates ~10×/s while recording). */
  elapsedMs: number
  maxMs: number
  recording: Recording | null
  /** Live microphone stream while recording (feeds the waveform). */
  stream: MediaStream | null
  start(): Promise<void>
  /** Stop and keep the recording. */
  stop(): void
  /** Stop and discard. */
  cancel(): void
  /** Forget the last recording / error. */
  reset(): void
}

const stopTracks = (s: MediaStream | null) => s?.getTracks().forEach((t) => t.stop())

type TickRef = { current: ReturnType<typeof setInterval> | null }
function clearTick(ref: TickRef): void {
  if (ref.current !== null) clearInterval(ref.current)
  ref.current = null
}

export function useRecorder(
  opts: { maxMs?: number; minMs?: number; onStart?: () => void } = {},
): RecorderApi {
  const maxMs = opts.maxMs ?? MAX_AUDIO_SECONDS * 1000
  const minMs = opts.minMs ?? MIN_AUDIO_SECONDS * 1000
  const [state, setState] = useState<RecorderState>('idle')
  const [error, setError] = useState<RecorderErrorKind | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [recording, setRecording] = useState<Recording | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const discardRef = useRef(false)
  const busyRef = useRef(false)
  const mountedRef = useRef(true)
  const onStartRef = useRef(opts.onStart)
  useEffect(() => {
    onStartRef.current = opts.onStart
  })

  const release = useCallback(() => {
    clearTick(tickRef)
    stopTracks(streamRef.current)
    streamRef.current = null
    if (mountedRef.current) setStream(null)
  }, [])

  const fail = useCallback(
    (kind: RecorderErrorKind) => {
      release()
      recorderRef.current = null
      busyRef.current = false
      if (!mountedRef.current) return
      setError(kind)
      setState('error')
    },
    [release],
  )

  const stop = useCallback(() => {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop()
      } catch {
        fail('failed')
      }
    }
  }, [fail])

  const cancel = useCallback(() => {
    discardRef.current = true
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') stop()
    else {
      release()
      busyRef.current = false
      if (mountedRef.current) setState('idle')
    }
  }, [release, stop])

  const start = useCallback(async () => {
    if (busyRef.current) return
    const problem = recorderSupport()
    if (problem) {
      fail(problem)
      return
    }
    busyRef.current = true
    discardRef.current = false
    setError(null)
    setRecording(null)
    setElapsedMs(0)
    setState('requesting')

    let media: MediaStream
    try {
      media = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch (err) {
      fail(mapMediaError(err))
      return
    }
    // Unmounted or cancelled while the permission prompt was open.
    if (!mountedRef.current || discardRef.current) {
      stopTracks(media)
      busyRef.current = false
      if (mountedRef.current) setState('idle')
      return
    }

    const mimeType = pickMimeType()
    let rec: MediaRecorder
    try {
      rec = mimeType ? new MediaRecorder(media, { mimeType }) : new MediaRecorder(media)
    } catch {
      try {
        rec = new MediaRecorder(media)
      } catch {
        stopTracks(media)
        fail('unsupported')
        return
      }
    }

    streamRef.current = media
    recorderRef.current = rec
    chunksRef.current = []
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
    }
    rec.onerror = () => fail('failed')
    rec.onstop = () => {
      const durationMs = Math.min(maxMs, performance.now() - startedAtRef.current)
      const type = rec.mimeType || mimeType || 'audio/webm'
      const chunks = chunksRef.current
      chunksRef.current = []
      recorderRef.current = null
      busyRef.current = false
      release()
      if (!mountedRef.current) return
      setElapsedMs(durationMs)
      if (discardRef.current) {
        setState('idle')
        setElapsedMs(0)
        return
      }
      if (durationMs < minMs || chunks.length === 0) {
        setError('too_short')
        setState('error')
        return
      }
      setRecording({ blob: new Blob(chunks, { type }), durationSec: durationMs / 1000, mimeType: type })
      setState('recorded')
    }

    try {
      rec.start(250)
    } catch {
      stopTracks(media)
      fail('failed')
      return
    }
    startedAtRef.current = performance.now()
    setStream(media)
    setState('recording')
    onStartRef.current?.()
    tickRef.current = setInterval(() => {
      const elapsed = performance.now() - startedAtRef.current
      setElapsedMs(Math.min(elapsed, maxMs))
      if (elapsed >= maxMs) stop() // Whisper's 30 s window
    }, 100)
  }, [fail, maxMs, minMs, release, stop])

  const reset = useCallback(() => {
    setRecording(null)
    setError(null)
    setElapsedMs(0)
    setState('idle')
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      discardRef.current = true
      const rec = recorderRef.current
      if (rec && rec.state !== 'inactive') {
        try {
          rec.stop()
        } catch {
          /* ignore */
        }
      }
      clearTick(tickRef)
      stopTracks(streamRef.current)
      streamRef.current = null
    }
  }, [])

  return { state, error, elapsedMs, maxMs, recording, stream, start, stop, cancel, reset }
}
