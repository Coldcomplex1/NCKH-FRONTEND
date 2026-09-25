import { VN_TIME_ZONE } from '@/core/lang'

/** Calendar/clock parts of an instant in Vietnam time (Asia/Ho_Chi_Minh, UTC+7, no DST). */
export interface VnParts {
  year: number
  /** 1–12 */
  month: number
  /** 1–31 */
  day: number
  /** 0–23 */
  hour: number
  minute: number
  second: number
  /** 0 = Sunday … 6 = Saturday */
  weekday: number
}

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: VN_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  weekday: 'short',
  hourCycle: 'h23',
})

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function vnParts(date: Date): VnParts {
  const p: Record<string, string> = {}
  for (const part of fmt.formatToParts(date)) p[part.type] = part.value
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: WEEKDAYS.indexOf(p.weekday ?? 'Sun'),
  }
}

/** The Vietnam calendar date `offset` days after `date` (offset may be negative). */
export function vnDateOffset(date: Date, offset: number): VnParts {
  return vnParts(new Date(date.getTime() + offset * 86_400_000))
}

/** Part of day, Vietnamese convention. */
export type PartOfDay = 'morning' | 'noon' | 'afternoon' | 'evening' | 'night'
export function partOfDay(hour: number): PartOfDay {
  if (hour >= 4 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 13) return 'noon'
  if (hour >= 13 && hour < 18) return 'afternoon'
  if (hour >= 18 && hour < 22) return 'evening'
  return 'night'
}

/** Whole days from (y1,m1,d1) to (y2,m2,d2), calendar arithmetic. */
export function daysBetween(y1: number, m1: number, d1: number, y2: number, m2: number, d2: number): number {
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}

/** Weekday (0 = Sunday) of a calendar date. */
export function weekdayOf(y: number, m: number, d: number): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}
