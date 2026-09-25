import type { RunDateTime } from '@/content/stats'
import { utcMs } from '@/content/stats'
import { LOCALE, type Lang } from '@/core/lang'
import type { Fmt } from '@/i18n/format'

/** Formatting helpers shared by copy.vi.ts / copy.en.ts (all locale-aware; no toFixed). */

const SUPERSCRIPT: Record<string, string> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
}

/** 0.000005 → "5 × 10⁻⁶" (mantissa formatted for the locale). */
export function sci(x: number, f: Fmt): string {
  if (x === 0) return f.int(0)
  const exp = Math.floor(Math.log10(Math.abs(x)))
  const mantissa = x / 10 ** exp
  const sup = String(exp)
    .split('')
    .map((ch) => SUPERSCRIPT[ch] ?? ch)
    .join('')
  return `${f.numFlex(mantissa, 2)} × 10${sup}`
}

/** Wall-clock run time as written in the log (no zone conversion). */
export function runDate(d: RunDateTime, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], {
    timeZone: 'UTC',
    day: '2-digit',
    month: lang === 'vi' ? '2-digit' : 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(utcMs(d))
}

/** 9370 minutes → "6 ngày 12 giờ 10 phút" / "6 d 12 h 10 min". */
export function spanText(minutes: number, lang: Lang, f: Fmt): string {
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = Math.round(minutes % 60)
  const units = lang === 'vi' ? ['ngày', 'giờ', 'phút'] : ['d', 'h', 'min']
  return [d, h, m]
    .map((v, i) => (v > 0 ? `${f.int(v)} ${units[i]}` : ''))
    .filter(Boolean)
    .join(' ')
}

/** Signed percentage points: +0,04 điểm % / −0.13 pp. */
export function signedPp(delta: number, f: Fmt): string {
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±'
  return `${sign}${f.pp(Math.abs(delta))}`
}
