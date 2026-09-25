import type { Lang } from '@/core/lang'
import type { WeatherData, WeatherDay } from '@/core/weather'

/** Deterministic variant choice: seed 0 (or no seed) → the first variant. */
export function pickBySeed<T>(variants: readonly T[], seed: number): T {
  if (variants.length === 0) throw new Error('no variants')
  return variants[seed % variants.length]!
}

/** Seeds may be any number; normalise to a non-negative integer. */
export function normSeed(seed: number | undefined): number {
  if (seed === undefined || !Number.isFinite(seed)) return 0
  return Math.abs(Math.trunc(seed))
}

const SAFE_TEXT = /^[\p{L}\p{M}\p{N} ,.?!'-]{1,40}$/u

/**
 * Suggestions and timer labels come from the parser's own lexicon, but they end up in the bubble and
 * TTS: anything that does not look like a short command phrase is dropped rather than shown.
 */
export function safePhrase(s: string | undefined): string | undefined {
  if (typeof s !== 'string') return undefined
  const t = s.normalize('NFC').replace(/\s+/g, ' ').trim()
  return SAFE_TEXT.test(t) ? t : undefined
}

export function safeList(list: readonly string[] | undefined, max: number): string[] {
  const out: string[] = []
  for (const s of list ?? []) {
    const t = safePhrase(s)
    if (t && !out.includes(t)) out.push(t)
    if (out.length >= max) break
  }
  return out
}

/** Upper-cases the first letter (Vietnamese-safe). */
export function capFirst(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toLocaleUpperCase('vi-VN') + s.slice(1)
}

/** Joins with commas and a final word: ["a","b","c"] → "a, b rồi c". */
export function joinList(items: readonly string[], last: string): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} ${last} ${items[items.length - 1]}`
}

/** WMO codes that mean something wet is falling (drizzle, rain, showers, storms). */
export function isRainCode(code: number): boolean {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99)
}

export type RainLevel = 'likely' | 'possible' | 'unlikely'
export function rainLevel(p: number): RainLevel {
  return p >= 60 ? 'likely' : p >= 30 ? 'possible' : 'unlikely'
}

export const HOT_C = 35
export const COLD_C = 18

export function forecastDay(data: WeatherData, dayOffset: number): WeatherDay | undefined {
  return data.daily[dayOffset]
}

// ---- TTS form

const SPEECH_COMMON: [RegExp, string][] = [
  [/PhoWhisper-large/g, 'Pho Whisper large'],
  [/PhoWhisper/g, 'Pho Whisper'],
  [/ViMD/g, 'Vi M D'],
  // "tỉ lệ lỗi từ (WER)" must not be read twice.
  [/\s*\(WER\)/g, ''],
  [/[“”"]/g, ''],
]

const SPEECH_BY_LANG: Record<Lang, [RegExp, string][]> = {
  vi: [
    [/\bWER\b/g, 'tỉ lệ lỗi từ'],
    [/\bTP\.\s*/g, 'thành phố '],
    [/km\/h/g, ' ki lô mét trên giờ'],
    [/°C/g, ' độ C'],
    [/°/g, ' độ'],
    [/%/g, ' phần trăm'],
    [/×/g, ' nhân '],
    [/÷/g, ' chia '],
    [/\//g, ' trên '],
  ],
  en: [
    [/\bWER\b/g, 'word error rate'],
    [/km\/h/g, ' kilometers per hour'],
    [/°C/g, ' degrees Celsius'],
    [/°/g, ' degrees'],
    [/%/g, ' percent'],
    [/×/g, ' times '],
    [/÷/g, ' divided by '],
    [/\//g, ' over '],
  ],
}

/** The text a TTS voice should read: spells out names and symbols voices mangle. */
export function toSpeech(text: string, lang: Lang): string {
  let s = text
  for (const [re, to] of SPEECH_COMMON) s = s.replace(re, to)
  for (const [re, to] of SPEECH_BY_LANG[lang]) s = s.replace(re, to)
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim()
}
