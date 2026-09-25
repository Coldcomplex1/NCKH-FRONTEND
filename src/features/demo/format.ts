import type { MathToken } from '@/core/actions'
import type { Lang } from '@/core/lang'
import type { Fmt } from '@/i18n'
import { vnParts, type VnParts } from '@/lib/vnTime'

/**
 * Display helpers for the demo. Clock/calendar values ALWAYS come from `vnParts` (Vietnam time,
 * whatever the device time zone); numbers go through `Fmt` (Intl).
 */

export const pad2 = (n: number): string => String(n).padStart(2, '0')

/** "08:45" in Vietnam time. */
export function clockHm(at: Date | number): string {
  const p = vnParts(typeof at === 'number' ? new Date(at) : at)
  return `${pad2(p.hour)}:${pad2(p.minute)}`
}

/** Remaining time for a timer: "4:07", or "1:02:03" past an hour. */
export function formatCountdown(totalSec: number): string {
  const s = Math.max(0, Math.ceil(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${h}:${pad2(m)}:${pad2(sec)}` : `${m}:${pad2(sec)}`
}

/** "1 phút 30 giây" / "1 min 30 s". */
export function formatDuration(seconds: number, lang: Lang, fmt: Fmt): string {
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const units = lang === 'vi' ? { h: 'giờ', m: 'phút', s: 'giây' } : { h: 'h', m: 'min', s: 's' }
  const parts: string[] = []
  if (h) parts.push(`${fmt.int(h)} ${units.h}`)
  if (m) parts.push(`${fmt.int(m)} ${units.m}`)
  if (s || parts.length === 0) parts.push(`${fmt.int(s)} ${units.s}`)
  return parts.join(' ')
}

const OPS: Record<string, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' }

/** "5 + 3" with locale number formatting and typographic operators. */
export function formatMathExpr(expr: MathToken[], fmt: Fmt): string {
  return expr.map((t) => (typeof t === 'number' ? fmt.numFlex(t) : (OPS[t] ?? t))).join(' ')
}

export const WEEKDAYS: Record<Lang, readonly string[]> = {
  vi: ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
}

const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** "Thứ Năm, ngày 24 tháng 9 năm 2026" / "Thursday, September 24, 2026". Years are never grouped. */
export function formatVnDate(p: VnParts, lang: Lang, withWeekday = true): string {
  const wd = WEEKDAYS[lang][p.weekday] ?? ''
  if (lang === 'vi') {
    const date = `ngày ${p.day} tháng ${p.month} năm ${p.year}`
    return withWeekday ? `${wd}, ${date}` : date.charAt(0).toUpperCase() + date.slice(1)
  }
  const date = `${MONTHS_EN[p.month - 1] ?? ''} ${p.day}, ${p.year}`
  return withWeekday ? `${wd}, ${date}` : date
}
