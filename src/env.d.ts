interface ImportMetaEnv {
  /** Base URL of the ASR backend. Setting it enables the Audio tab. */
  readonly VITE_ASR_URL?: string
  /** Optional kill switch: "false" keeps the Audio tab disabled even when VITE_ASR_URL is set. */
  readonly VITE_ASR_ENABLED?: string
  readonly VITE_ASR_TIMEOUT_MS?: string
  readonly VITE_ASR_MAX_UPLOAD_MB?: string
  /** Dev only: fake transcripts to exercise the audio UI without a backend. */
  readonly VITE_ASR_MOCK?: string
  /** Command parser engine: "rules" (default) or "llm" (future Qwen parser). */
  readonly VITE_NLU_ENGINE?: string
  readonly VITE_NLU_URL?: string
  /** AI moves (Qwen) endpoint; default "/api/motion" (the Vercel function on the same site). */
  readonly VITE_MOTION_API?: string
  /** Dev only: canned AI moves without a Qwen key. */
  readonly VITE_MOTION_MOCK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
