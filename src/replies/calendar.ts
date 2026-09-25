/**
 * Language-neutral calendar facts for the date / weekday / lunar replies. Everything is computed in
 * Vietnam time (vnTime) and with the UTC+7 lunar calendar (lib/calendar/lunar).
 */
import {
  canChiYear,
  festivalOn,
  jdFromDate,
  jdToDate,
  lunarMonthLength,
  lunarToSolar,
  solarToLunar,
  zodiacIndex,
  type LunarDate,
  type LunarFestival,
} from '@/lib/calendar/lunar'
import { daysBetween, vnDateOffset, weekdayOf } from '@/lib/vnTime'

export interface CalDate {
  year: number
  /** 1–12 */
  month: number
  day: number
  /** 0 = Sunday … 6 = Saturday */
  weekday: number
}

/** The Vietnam calendar date `offset` days after the instant `iso`. */
export function calDate(iso: string, offset = 0): CalDate {
  const p = vnDateOffset(new Date(iso), offset)
  return { year: p.year, month: p.month, day: p.day, weekday: p.weekday }
}

function jdOf(d: CalDate): number {
  return jdFromDate(d.day, d.month, d.year)
}

function fromJd(jd: number): CalDate {
  const s = jdToDate(jd)
  return { year: s.year, month: s.month, day: s.day, weekday: weekdayOf(s.year, s.month, s.day) }
}

function lunarOf(d: CalDate): LunarDate {
  return solarToLunar(d.day, d.month, d.year)
}

export interface LunarDayFacts {
  solar: CalDate
  lunar: LunarDate
  /** Can Chi of the lunar year, e.g. "Bính Ngọ". */
  canChi: string
  /** Index into ZODIAC. */
  zodiac: number
  /** True when the lunar year differs from the solar year (January/February before Tết). */
  lunarYearLags: boolean
  festival?: LunarFestival
  /** Festival on the following day. */
  festivalNext?: LunarFestival
}

export function lunarDayFacts(iso: string, offset: number): LunarDayFacts {
  const solar = calDate(iso, offset)
  const lunar = lunarOf(solar)
  const next = lunarOf(fromJd(jdOf(solar) + 1))
  return {
    solar,
    lunar,
    canChi: canChiYear(lunar.year),
    zodiac: zodiacIndex(lunar.year),
    lunarYearLags: lunar.year !== solar.year,
    festival: festivalOn(lunar),
    festivalNext: festivalOn(next),
  }
}

export type TetFacts =
  | { kind: 'during'; day: number; canChi: string }
  | { kind: 'countdown'; canChi: string; zodiac: number; solar: CalDate; days: number }

export function tetFacts(iso: string): TetFacts {
  const today = calDate(iso)
  const l = lunarOf(today)
  if (l.month === 1 && !l.leap && l.day <= 3)
    return { kind: 'during', day: l.day, canChi: canChiYear(l.year) }
  const year = l.year + 1
  const s = lunarToSolar(1, 1, year)
  if (!s) throw new Error(`no Tết for lunar year ${year}`)
  return {
    kind: 'countdown',
    canChi: canChiYear(year),
    zodiac: zodiacIndex(year),
    solar: { ...s, weekday: weekdayOf(s.year, s.month, s.day) },
    days: daysBetween(today.year, today.month, today.day, s.year, s.month, s.day),
  }
}

export interface MonthDayFacts {
  /** The lunar date asked about (day 15 for rằm, day 1 for mùng 1). */
  lunar: LunarDate
  solar: CalDate
  /** Days from today (0 = today). */
  days: number
  festival?: LunarFestival
}

/**
 * The next lunar day `lunarDay` (15 = rằm, 1 = mùng 1) that has not passed yet: this lunar month's
 * if today is on or before it, otherwise next month's.
 */
export function nextLunarDay(iso: string, lunarDay: 1 | 15): MonthDayFacts {
  const today = calDate(iso)
  const todayJd = jdOf(today)
  const l = lunarOf(today)
  const monthStart = todayJd - (l.day - 1)
  let targetJd: number
  if (l.day <= lunarDay) {
    targetJd = monthStart + lunarDay - 1
  } else {
    const len = lunarMonthLength(l.month, l.year, l.leap) || 30
    targetJd = monthStart + len + lunarDay - 1
  }
  const solar = fromJd(targetJd)
  const lunar = lunarOf(solar)
  return { lunar, solar, days: targetJd - todayJd, festival: festivalOn(lunar) }
}

/** The lunar year `offset` years from the current one ("năm sau" = +1). */
export function lunarYearFacts(iso: string, offset: number): { canChi: string; zodiac: number } {
  const year = lunarOf(calDate(iso)).year + offset
  return { canChi: canChiYear(year), zodiac: zodiacIndex(year) }
}

/** The next lunar day `lunarDay` of the (non-leap) lunar month `month`, today included. */
export function nextLunarDayOfMonth(iso: string, lunarDay: 1 | 15, month: number): MonthDayFacts {
  const today = calDate(iso)
  const todayJd = jdOf(today)
  const l = lunarOf(today)
  for (const year of [l.year, l.year + 1, l.year + 2]) {
    const s = lunarToSolar(lunarDay, month, year)
    if (!s) continue
    const jd = jdFromDate(s.day, s.month, s.year)
    if (jd < todayJd) continue
    const solar = fromJd(jd)
    const lunar = lunarOf(solar)
    return { lunar, solar, days: jd - todayJd, festival: festivalOn(lunar) }
  }
  return nextLunarDay(iso, lunarDay)
}
