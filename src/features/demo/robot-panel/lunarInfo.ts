import {
  canChiYear,
  festivalOn,
  lunarMonthLength,
  lunarToSolar,
  solarToLunar,
  zodiacIndex,
  type LunarDate,
  type LunarFestival,
} from '@/lib/calendar/lunar'
import { daysBetween, vnDateOffset, vnParts, type VnParts } from '@/lib/vnTime'

/** Everything the lunar / date cards show, computed in Vietnam time (pure, testable). */
export interface LunarInfo {
  solar: VnParts
  lunar: LunarDate
  canChi: string
  zodiac: number
  festival: LunarFestival | undefined
}

export function lunarInfo(at: Date): LunarInfo {
  const solar = vnParts(at)
  const lunar = solarToLunar(solar.day, solar.month, solar.year)
  return {
    solar,
    lunar,
    canChi: canChiYear(lunar.year),
    zodiac: zodiacIndex(lunar.year),
    festival: festivalOn(lunar),
  }
}

export type LunarCountdownQuery = 'tet' | 'ram' | 'mung1'

/** Days from `at` (Vietnam date) until the next Tết / rằm (15th) / mùng 1, and that solar date. */
export function lunarCountdown(at: Date, query: LunarCountdownQuery): { days: number; target: VnParts } {
  const { solar, lunar } = lunarInfo(at)
  const monthLen = lunarMonthLength(lunar.month, lunar.year, lunar.leap) || 30
  let days: number
  if (query === 'tet') {
    if (lunar.month === 1 && lunar.day === 1 && !lunar.leap) days = 0
    else {
      const tet = lunarToSolar(1, 1, lunar.year + 1)
      days = tet ? daysBetween(solar.year, solar.month, solar.day, tet.year, tet.month, tet.day) : 0
    }
  } else if (query === 'ram') {
    days = lunar.day <= 15 ? 15 - lunar.day : monthLen - lunar.day + 15
  } else {
    days = lunar.day === 1 ? 0 : monthLen - lunar.day + 1
  }
  return { days, target: vnDateOffset(at, days) }
}
