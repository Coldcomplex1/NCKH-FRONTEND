import type { Lang } from './lang'

export type SpeakResult = 'ended' | 'muted' | 'unavailable' | 'interrupted' | 'error'
export type VoiceStatus = 'loading' | 'ok' | 'missing' | 'unsupported'

/** Text-to-speech (src/speech). Only the engine calls speak(); the UI only primes and reads status. */
export interface Speaker {
  readonly supported: boolean
  /** Call synchronously inside the user's click/keypress handler (iOS/Chrome activation rules). */
  prime(): void
  status(lang: Lang): VoiceStatus
  /** Subscribe to voice-list changes (voices load asynchronously). Returns unsubscribe. */
  onVoicesChanged(cb: () => void): () => void
  speak(text: string, lang: Lang, opts?: { signal?: AbortSignal; onStart?: () => void }): Promise<SpeakResult>
  cancel(): void
}
