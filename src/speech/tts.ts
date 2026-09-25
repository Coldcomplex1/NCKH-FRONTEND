import { LOCALE, type Lang } from '@/core/lang'
import type { SpeakResult, Speaker, VoiceStatus } from '@/core/speech'
import {
  estimateSpeechMs,
  pickLocalVoice,
  pickVoice,
  SPEECH_PITCH,
  SPEECH_RATE,
  splitForSpeech,
  type VoiceLike,
} from './voiceRank'

/**
 * Web Speech API text-to-speech, hardened for the browsers our (elderly) users have:
 * - voices load asynchronously: getVoices() now + `voiceschanged` + polling every 250 ms for 3 s;
 * - utterances are kept referenced until they end (Chrome can GC them and never fire `end`);
 * - text goes out in ≤180-character sentence chunks (Chrome cuts long utterances off);
 * - a safety timeout (2 × estimate + 2 s) so a lost `end` event never stalls the engine;
 * - ~80 ms pause between cancel() and the next speak() (WebKit drops the new utterance otherwise);
 * - a failing network voice (Edge offline) is retried once with the best on-device voice;
 * - Vietnamese is NEVER read by a non-Vietnamese voice: speak() returns 'unavailable' instead.
 */

export interface UtteranceLike {
  text: string
  lang: string
  voice: unknown
  rate: number
  pitch: number
  volume: number
  onstart: ((ev: unknown) => void) | null
  onend: ((ev: unknown) => void) | null
  onerror: ((ev: { error?: string } | unknown) => void) | null
}

export interface SynthLike {
  speak(u: UtteranceLike): void
  cancel(): void
  getVoices(): VoiceLike[]
  resume?(): void
  readonly paused?: boolean
  addEventListener?(type: 'voiceschanged', cb: () => void): void
  removeEventListener?(type: 'voiceschanged', cb: () => void): void
  onvoiceschanged?: ((ev: unknown) => void) | null
}

export interface SpeechEnv {
  synth: SynthLike
  createUtterance(text: string): UtteranceLike
  /** The speaker answers 'muted' without speaking while this returns true. */
  isMuted?: () => boolean
  now?: () => number
}

export const VOICE_POLL_MS = 250
export const VOICE_LOAD_MS = 3_000
export const CANCEL_GAP_MS = 80

type ChunkResult = 'ended' | 'interrupted' | 'error'

export interface WebSpeaker extends Speaker {
  /** Current voice for a language (null when missing). */
  voiceFor(lang: Lang): VoiceLike | null
  dispose(): void
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** The speaker for environments without speech synthesis (node, old browsers). */
export function createNullSpeaker(): WebSpeaker {
  return {
    supported: false,
    prime() {},
    status: (): VoiceStatus => 'unsupported',
    onVoicesChanged: () => () => {},
    async speak(): Promise<SpeakResult> {
      return 'unavailable'
    },
    cancel() {},
    voiceFor: () => null,
    dispose() {},
  }
}

export function createSpeaker(env: SpeechEnv | null): WebSpeaker {
  if (!env) return createNullSpeaker()
  const { synth } = env
  const now = env.now ?? Date.now
  const startedAt = now()

  let voices: VoiceLike[] = []
  let voiceKey = ''
  let loadingDone = false
  let primed = false
  let gen = 0
  let lastCancelAt = -Infinity
  let active: { u: UtteranceLike; finish: (r: ChunkResult) => void } | null = null
  /** Strong references until each utterance ends (see header). */
  const live = new Set<UtteranceLike>()
  const listeners = new Set<() => void>()
  const loadWaiters = new Set<() => void>()

  const notify = () => {
    for (const w of [...loadWaiters]) w()
    for (const l of [...listeners]) {
      try {
        l()
      } catch (e) {
        console.error('[speech] voices listener failed', e)
      }
    }
  }

  const refresh = () => {
    let list: VoiceLike[] = []
    try {
      list = [...(synth.getVoices() ?? [])]
    } catch {
      list = []
    }
    const key = list.map((v) => `${v.name}|${v.lang}`).join(';')
    if (key !== voiceKey) {
      voiceKey = key
      voices = list
      notify()
    }
  }

  refresh()
  if (synth.addEventListener) synth.addEventListener('voiceschanged', refresh)
  else synth.onvoiceschanged = refresh
  const poll = setInterval(() => {
    refresh()
    if (now() - startedAt >= VOICE_LOAD_MS) {
      clearInterval(poll)
      loadingDone = true
      notify()
    }
  }, VOICE_POLL_MS)

  /** Resolves when a voice for `lang` exists, loading has finished, or the signal aborts. */
  const waitForVoice = (lang: Lang, signal?: AbortSignal) =>
    new Promise<void>((resolve) => {
      const check = () => {
        if (loadingDone || pickVoice(voices, lang) || signal?.aborted) {
          loadWaiters.delete(check)
          signal?.removeEventListener('abort', check)
          resolve()
        }
      }
      loadWaiters.add(check)
      signal?.addEventListener('abort', check, { once: true })
      check()
    })

  const hardCancel = () => {
    try {
      synth.cancel()
    } catch {
      /* ignore */
    }
    lastCancelAt = now()
  }

  /**
   * Stops our current utterance. The synth is only cancelled when one of ours is playing, so the
   * silent priming utterance (spoken inside the user's gesture) is never cancelled by the submit
   * that follows it.
   */
  const cancel = () => {
    gen++
    const cur = active
    active = null
    if (!cur) return
    cur.finish('interrupted')
    hardCancel()
  }

  const speakChunk = (
    text: string,
    voice: VoiceLike,
    lang: Lang,
    onStart: () => void,
  ): Promise<ChunkResult> =>
    new Promise<ChunkResult>((resolve) => {
      const u = env.createUtterance(text)
      u.lang = LOCALE[lang]
      u.voice = voice
      u.rate = SPEECH_RATE[lang]
      u.pitch = SPEECH_PITCH
      u.volume = 1
      let done = false
      const finish = (r: ChunkResult) => {
        if (done) return
        done = true
        clearTimeout(safety)
        live.delete(u)
        if (active?.u === u) active = null
        resolve(r)
      }
      u.onstart = () => onStart()
      u.onend = () => finish('ended')
      u.onerror = (ev) => {
        const code = (ev as { error?: string } | null)?.error
        finish(code === 'interrupted' || code === 'canceled' ? 'interrupted' : 'error')
      }
      const safety = setTimeout(
        () => {
          // A lost `end` event: move on, and stop whatever is left.
          finish('ended')
          hardCancel()
        },
        2 * estimateSpeechMs(text, SPEECH_RATE[lang]) + 2_000,
      )
      live.add(u)
      active = { u, finish }
      try {
        if (synth.paused) synth.resume?.()
        synth.speak(u)
      } catch {
        finish('error')
      }
    })

  const speaker: WebSpeaker = {
    supported: true,

    prime() {
      if (primed) return
      primed = true
      try {
        // Inside the user's gesture: unlocks speech on iOS / Chrome for later (async) replies.
        const u = env.createUtterance('')
        u.volume = 0
        if (synth.paused) synth.resume?.()
        synth.speak(u)
      } catch {
        /* ignore */
      }
    },

    status(lang) {
      if (pickVoice(voices, lang)) return 'ok'
      return loadingDone ? 'missing' : 'loading'
    },

    onVoicesChanged(cb) {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },

    voiceFor: (lang) => pickVoice(voices, lang),

    async speak(text, lang, opts = {}) {
      if (env.isMuted?.()) return 'muted'
      const { signal } = opts
      if (signal?.aborted) return 'interrupted'
      // A new speak() supersedes whatever is still being read.
      if (active) cancel()
      const my = ++gen
      const onAbort = () => {
        if (gen === my) cancel()
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      try {
        if (!pickVoice(voices, lang) && !loadingDone) await waitForVoice(lang, signal)
        if (gen !== my || signal?.aborted) return 'interrupted'
        let voice = pickVoice(voices, lang)
        if (!voice) return 'unavailable'

        const since = now() - lastCancelAt
        if (since < CANCEL_GAP_MS) await delay(CANCEL_GAP_MS - since)
        if (gen !== my) return 'interrupted'

        let started = false
        const onStart = () => {
          if (started) return
          started = true
          opts.onStart?.()
        }
        for (const chunk of splitForSpeech(text)) {
          let r = await speakChunk(chunk, voice, lang, onStart)
          if (r === 'error' && gen === my && voice.localService !== true) {
            const local = pickLocalVoice(voices, lang)
            if (local && local !== voice) {
              voice = local
              r = await speakChunk(chunk, voice, lang, onStart)
            }
          }
          if (gen !== my) return 'interrupted'
          if (r !== 'ended') return r
        }
        return 'ended'
      } finally {
        signal?.removeEventListener('abort', onAbort)
      }
    },

    cancel,

    dispose() {
      clearInterval(poll)
      if (synth.removeEventListener) synth.removeEventListener('voiceschanged', refresh)
      else if (synth.onvoiceschanged === refresh) synth.onvoiceschanged = null
      listeners.clear()
      loadWaiters.clear()
      cancel()
      live.clear()
    },
  }
  return speaker
}

/** The browser's speech synthesis, or null when there is none (node, SSR, very old browsers). */
export function browserSpeechEnv(isMuted?: () => boolean): SpeechEnv | null {
  if (typeof window === 'undefined') return null
  const synth = window.speechSynthesis as unknown as SynthLike | undefined
  const Utterance = window.SpeechSynthesisUtterance as unknown
  if (!synth || typeof Utterance !== 'function') return null
  const Ctor = Utterance as new (text: string) => UtteranceLike
  return { synth, createUtterance: (text) => new Ctor(text), isMuted }
}
