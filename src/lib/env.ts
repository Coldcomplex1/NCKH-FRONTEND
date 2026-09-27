const trimUrl = (s: string | undefined) => (s ?? '').trim().replace(/\/+$/, '')

/**
 * Whether `url` is safe to POST microphone audio to: HTTPS always, or plain HTTP to localhost /
 * 127.0.0.1 but only during local development. Pure and independent of `import.meta.env` so it's
 * testable in isolation.
 */
export function isAllowedAsrOrigin(url: string, isDev: boolean): boolean {
  if (!url) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol === 'https:') return true
  if (
    isDev &&
    parsed.protocol === 'http:' &&
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
  ) {
    return true
  }
  return false
}

const rawAsrUrl = trimUrl(import.meta.env.VITE_ASR_URL)
const asrUrlAllowed = isAllowedAsrOrigin(rawAsrUrl, import.meta.env.DEV)

if (rawAsrUrl && !asrUrlAllowed) {
  console.warn(
    `VITE_ASR_URL must be https:// (http://localhost or http://127.0.0.1 only in dev). ` +
      `Got "${rawAsrUrl}" — the Audio tab is disabled.`,
  )
}

const asrUrl = asrUrlAllowed ? rawAsrUrl : ''

/** The AI-moves endpoint: a same-site path, or an allowed absolute origin (as for the ASR). */
export function motionApiUrl(raw: string | undefined, isDev: boolean): string {
  const v = trimUrl(raw)
  if (!v) return '/api/motion'
  if (v.startsWith('/') && !v.startsWith('//')) return v
  return isAllowedAsrOrigin(v, isDev) ? v : '/api/motion'
}

/** Build-time configuration (Vite inlines VITE_* at build time; redeploy after changing). */
export const ENV = {
  asr: {
    url: asrUrl,
    /** The Audio tab turns on when VITE_ASR_URL is a secure origin (VITE_ASR_ENABLED=false is an optional kill switch). */
    enabled: asrUrl.length > 0 && import.meta.env.VITE_ASR_ENABLED !== 'false',
    /** Dev-only fake transcriber; can never ship in a production build. */
    mock: import.meta.env.DEV && import.meta.env.VITE_ASR_MOCK === 'true',
    timeoutMs: Number(import.meta.env.VITE_ASR_TIMEOUT_MS) || 45_000,
    maxUploadMB: Number(import.meta.env.VITE_ASR_MAX_UPLOAD_MB) || 10,
    /** Browser echo cancellation / noise suppression / auto gain on the mic (VITE_ASR_MIC_DSP=false = raw mic). */
    micDsp: import.meta.env.VITE_ASR_MIC_DSP !== 'false',
  },
  nlu: {
    engine: import.meta.env.VITE_NLU_ENGINE === 'llm' ? ('llm' as const) : ('rules' as const),
    url: trimUrl(import.meta.env.VITE_NLU_URL),
  },
  /** AI-invented moves (Qwen). On only when the server says so (GET /api/motion → enabled). */
  motion: {
    url: motionApiUrl(import.meta.env.VITE_MOTION_API, import.meta.env.DEV),
    /** Dev-only canned moves (moonwalk, backflip, lộn nhào, nháy mắt); never in a production build. */
    mock: import.meta.env.DEV && import.meta.env.VITE_MOTION_MOCK === 'true',
    /** The robot shows its thinking pose meanwhile; after this the move counts as failed. */
    timeoutMs: 40_000,
  },
} as const
