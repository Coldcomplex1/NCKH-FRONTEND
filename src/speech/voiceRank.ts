import type { Lang } from '@/core/lang'

/**
 * Picking a Web Speech voice. Pure functions over the voice list (unit-tested with plain objects).
 *
 * Vietnamese is NEVER spoken with a non-Vietnamese voice (an English voice reading Vietnamese is
 * garbled): when no `vi*` voice exists the speaker reports 'missing' and the UI shows a notice.
 */

/** The subset of SpeechSynthesisVoice the ranking needs. */
export interface VoiceLike {
  name: string
  lang: string
  voiceURI?: string
  localService?: boolean
  default?: boolean
}

/** "vi_VN" (older Android Chrome) → "vi-vn". */
export function normalizeLang(lang: string | undefined | null): string {
  return (lang ?? '').trim().replaceAll('_', '-').toLowerCase()
}

/** Name patterns, best first. The first pattern with a matching voice wins. */
export const VOICE_PREFERENCES: Record<Lang, readonly RegExp[]> = {
  vi: [
    /HoaiMy/i, // Edge "Microsoft HoaiMy Online (Natural)" (network, Southern accent)
    /NamMinh/i, // Edge "Microsoft NamMinh Online (Natural)" (network, Northern accent)
    /Linh/i, // Apple
    /Google|Tiếng Việt/i, // Android / Chrome Google TTS
    /\bAn\b/, // Windows "Microsoft An" (Vietnamese speech pack)
  ],
  en: [/Samantha|Ava|Allison/, /Google US English/, /(Aria|Jenny|Guy).*Natural/, /Zira|David/],
}

export function isLangVoice(v: VoiceLike, lang: Lang): boolean {
  const l = normalizeLang(v.lang)
  return l === lang || l.startsWith(`${lang}-`)
}

/** Every usable voice for `lang`, best first. */
export function rankVoices<V extends VoiceLike>(voices: readonly V[], lang: Lang): V[] {
  const candidates = voices.filter((v) => isLangVoice(v, lang))
  const score = (v: V): number => {
    const i = VOICE_PREFERENCES[lang].findIndex((re) => re.test(v.name))
    let s = i === -1 ? 100 : i * 10
    // Unnamed fallbacks: en-US before other English variants; the platform default first.
    if (lang === 'en' && normalizeLang(v.lang) !== 'en-us') s += 5
    if (i === -1 && v.default) s -= 1
    return s
  }
  // Array.prototype.sort is stable, so equal scores keep the platform's order.
  return [...candidates].sort((a, b) => score(a) - score(b))
}

/** The voice to speak `lang` with, or null (→ 'missing'). */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], lang: Lang): V | null {
  return rankVoices(voices, lang)[0] ?? null
}

/** Best on-device voice (used to retry once when a network voice fails, e.g. Edge offline). */
export function pickLocalVoice<V extends VoiceLike>(voices: readonly V[], lang: Lang): V | null {
  return rankVoices(voices, lang).find((v) => v.localService === true) ?? null
}

/** Speech rate: a little slower than default, for elderly listeners. */
export const SPEECH_RATE: Record<Lang, number> = { vi: 0.9, en: 0.95 }
export const SPEECH_PITCH = 1.1

export const MAX_CHUNK_CHARS = 180

/**
 * Splits text into sentence chunks of at most `max` characters (Chrome cuts long utterances off
 * after ~15 s). Sentences are packed together while they fit; an over-long sentence is split at
 * commas, then at spaces.
 */
export function splitForSpeech(text: string, max = MAX_CHUNK_CHARS): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  if (clean.length <= max) return [clean]
  const sentences = clean.match(/[^.!?…]+(?:[.!?…]+|$)/g)?.map((s) => s.trim()) ?? [clean]
  const pieces: string[] = []
  for (const s of sentences) {
    if (!s) continue
    if (s.length <= max) pieces.push(s)
    else pieces.push(...splitLong(s, max))
  }
  const out: string[] = []
  for (const p of pieces) {
    const last = out[out.length - 1]
    if (last !== undefined && last.length + 1 + p.length <= max) out[out.length - 1] = `${last} ${p}`
    else out.push(p)
  }
  return out
}

function splitLong(s: string, max: number): string[] {
  const out: string[] = []
  let rest = s
  while (rest.length > max) {
    const window = rest.slice(0, max + 1)
    let cut = Math.max(window.lastIndexOf(', '), window.lastIndexOf('; '))
    if (cut > max * 0.4) cut += 1
    else cut = window.lastIndexOf(' ')
    if (cut <= 0) cut = max
    out.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) out.push(rest)
  return out
}

/** Rough speaking time (ms) of a chunk at `rate`: ~14 characters per second at rate 1. */
export function estimateSpeechMs(text: string, rate = 1): number {
  return Math.round(((text.length / 14) * 1000) / Math.max(0.1, rate))
}
