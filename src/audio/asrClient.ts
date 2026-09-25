import { ENV } from '@/lib/env'

/**
 * Client for the ASR backend (PhoWhisper-large fine-tuned on ViMD). Contract: docs/asr-api.md.
 *
 *   POST {VITE_ASR_URL}/transcribe   multipart/form-data, field "file"
 *   200 → { text, duration?, corrected_text?, alternatives? }
 *
 * The request is a CORS "simple request" on purpose: FormData body, no custom headers and no manual
 * Content-Type (the browser adds the multipart boundary), so no preflight is needed.
 */

export interface TranscribeResponse {
  /** Raw ASR transcript (always present). */
  text: string
  /** Audio length in seconds, as measured by the server. */
  duration?: number
  /** Future Qwen post-correction. When present, the robot acts on this instead of `text`. */
  corrected_text?: string
  /** Future n-best hypotheses (5-beam), for intent-aware reranking. */
  alternatives?: string[]
}

export type AsrErrorKind =
  | 'disabled'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'too_large'
  | 'unsupported_media'
  | 'unprocessable'
  | 'busy'
  | 'http'
  | 'bad_response'

export class AsrError extends Error {
  readonly kind: AsrErrorKind
  readonly status: number | undefined
  /** Server-provided `detail` (FastAPI string or joined validation messages). Not shown verbatim to users. */
  readonly detail: string | undefined
  /** From `Retry-After` on 429/503. */
  readonly retryAfterSec: number | undefined

  constructor(
    kind: AsrErrorKind,
    info: { status?: number; detail?: string; retryAfterSec?: number; cause?: unknown } = {},
  ) {
    super(
      `ASR ${kind}${info.status ? ` (HTTP ${info.status})` : ''}${info.detail ? `: ${info.detail}` : ''}`,
      {
        cause: info.cause,
      },
    )
    this.name = 'AsrError'
    this.kind = kind
    this.status = info.status
    this.detail = info.detail
    this.retryAfterSec = info.retryAfterSec
  }
}

export interface TranscribeOptions {
  signal?: AbortSignal
  /** Multipart filename. Default: "recording.wav" for WAV, the File's own name otherwise. */
  filename?: string
  timeoutMs?: number
  /** Override the base URL (tests); defaults to VITE_ASR_URL. Trailing slashes are ignored. */
  baseUrl?: string
  /** Override fetch (tests). */
  fetchImpl?: typeof fetch
}

const EXT_BY_MIME: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/ogg': 'ogg',
  'application/ogg': 'ogg',
}

/** Filename for the multipart part. The server's decoder (ffmpeg) uses the extension as a hint. */
export function uploadFilename(audio: Blob): string {
  const mime = audio.type.split(';')[0]?.trim().toLowerCase() ?? ''
  const ext = EXT_BY_MIME[mime]
  if (ext === 'wav') return 'recording.wav'
  if (typeof File !== 'undefined' && audio instanceof File && audio.name) return audio.name
  return `recording.${ext ?? 'bin'}`
}

/** `Retry-After` is either delta-seconds or an HTTP date. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  const at = Date.parse(trimmed)
  return Number.isNaN(at) ? undefined : Math.max(0, Math.ceil((at - now) / 1000))
}

/** FastAPI errors: `{detail: "text"}` or `{detail: [{loc, msg, type}, …]}` (validation). */
export function readDetail(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || !('detail' in body)) return undefined
  const detail = (body as { detail: unknown }).detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) =>
        typeof d === 'string' ? d : d && typeof d === 'object' && 'msg' in d ? String(d.msg) : undefined,
      )
      .filter((m): m is string => !!m)
    return msgs.length ? msgs.join('; ') : undefined
  }
  return undefined
}

function kindForStatus(status: number): AsrErrorKind {
  switch (status) {
    case 413:
      return 'too_large'
    case 415:
      return 'unsupported_media'
    case 422:
      return 'unprocessable'
    case 429:
    case 503:
      return 'busy'
    default:
      return 'http'
  }
}

/** Validate and normalize a 200 body. */
function toResponse(body: unknown): TranscribeResponse {
  if (!body || typeof body !== 'object') throw new AsrError('bad_response')
  const b = body as Record<string, unknown>
  if (typeof b.text !== 'string') throw new AsrError('bad_response', { detail: 'missing "text"' })
  const out: TranscribeResponse = { text: b.text }
  if (typeof b.duration === 'number' && Number.isFinite(b.duration)) out.duration = b.duration
  if (typeof b.corrected_text === 'string' && b.corrected_text.trim()) out.corrected_text = b.corrected_text
  if (Array.isArray(b.alternatives)) {
    const alts = b.alternatives.filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
    if (alts.length) out.alternatives = alts
  }
  return out
}

/**
 * Upload audio and return the transcript. Throws `AsrError` for every failure.
 * The timeout is a manual AbortController chained to the caller's signal — `AbortSignal.any` needs
 * Safari 17.4, above the site's Safari 16.4 baseline.
 */
export async function transcribe(audio: Blob, opts: TranscribeOptions = {}): Promise<TranscribeResponse> {
  const base = (opts.baseUrl ?? ENV.asr.url).trim().replace(/\/+$/, '')
  if (!base) throw new AsrError('disabled')
  const callerSignal = opts.signal
  if (callerSignal?.aborted) throw new AsrError('aborted')

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, opts.timeoutMs ?? ENV.asr.timeoutMs)
  const onCallerAbort = () => controller.abort()
  callerSignal?.addEventListener('abort', onCallerAbort, { once: true })

  const form = new FormData()
  form.append('file', audio, opts.filename ?? uploadFilename(audio))
  const doFetch = opts.fetchImpl ?? fetch

  try {
    let res: Response
    try {
      // No headers at all: keeps this a CORS simple request (no preflight).
      res = await doFetch(`${base}/transcribe`, { method: 'POST', body: form, signal: controller.signal })
    } catch (err) {
      throw mapThrown(err, timedOut, callerSignal)
    }

    if (!res.ok) {
      let detail: string | undefined
      try {
        detail = readDetail(await res.json())
      } catch {
        detail = undefined
      }
      const kind = kindForStatus(res.status)
      throw new AsrError(kind, {
        status: res.status,
        detail,
        retryAfterSec: kind === 'busy' ? parseRetryAfter(res.headers.get('Retry-After')) : undefined,
      })
    }

    let body: unknown
    try {
      body = await res.json()
    } catch (err) {
      if (timedOut || callerSignal?.aborted) throw mapThrown(err, timedOut, callerSignal)
      throw new AsrError('bad_response', { status: res.status, detail: 'invalid JSON', cause: err })
    }
    return toResponse(body)
  } finally {
    clearTimeout(timer)
    callerSignal?.removeEventListener('abort', onCallerAbort)
  }
}

function mapThrown(err: unknown, timedOut: boolean, callerSignal: AbortSignal | undefined): AsrError {
  if (err instanceof AsrError) return err
  if (timedOut) return new AsrError('timeout', { cause: err })
  if (callerSignal?.aborted) return new AsrError('aborted', { cause: err })
  if (err instanceof DOMException && err.name === 'AbortError') return new AsrError('aborted', { cause: err })
  // fetch rejects with TypeError for offline, DNS, CORS and mixed-content failures alike.
  return new AsrError('network', { cause: err })
}
