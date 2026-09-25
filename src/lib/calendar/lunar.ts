/**
 * Vietnamese lunar calendar (âm lịch), after the astronomical algorithm published by Hồ Ngọc Đức.
 * All conversions use time zone UTC+7: the Vietnamese calendar is defined at UTC+7, so a few dates
 * (e.g. Tết 1985, 2007) differ from the Chinese calendar.
 *
 * Original algorithm and code: © 2006 Hồ Ngọc Đức (astronomical algorithms after Jean Meeus,
 * "Astronomical Algorithms", 1998), permitted for personal, non-commercial use provided this
 * copyright notice is kept. This is a non-commercial research demo.
 */

const TZ = 7
const PI = Math.PI
const INT = Math.floor

export interface LunarDate {
  day: number
  month: number
  year: number
  leap: boolean
}

export interface SolarDate {
  day: number
  month: number
  year: number
}

export function jdFromDate(dd: number, mm: number, yy: number): number {
  const a = INT((14 - mm) / 12)
  const y = yy + 4800 - a
  const m = mm + 12 * a - 3
  let jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045
  if (jd < 2299161) jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083
  return jd
}

export function jdToDate(jd: number): SolarDate {
  let b: number
  let c: number
  if (jd > 2299160) {
    const a = jd + 32044
    b = INT((4 * a + 3) / 146097)
    c = a - INT((b * 146097) / 4)
  } else {
    b = 0
    c = jd + 32082
  }
  const d = INT((4 * c + 3) / 1461)
  const e = c - INT((1461 * d) / 4)
  const m = INT((5 * e + 2) / 153)
  return {
    day: e - INT((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * INT(m / 10),
    year: b * 100 + d - 4800 + INT(m / 10),
  }
}

/** Julian day of the k-th new moon after 1900-01-06 (Meeus, with corrections). */
function newMoon(k: number): number {
  const T = k / 1236.85
  const T2 = T * T
  const T3 = T2 * T
  const dr = PI / 180
  let jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3
  jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr)
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3
  let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M)
  C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr)
  C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr)
  C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr))
  C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M))
  C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr))
  C1 = C1 + 0.001 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M))
  const deltat =
    T < -11
      ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
      : -0.000278 + 0.000265 * T + 0.000262 * T2
  return jd1 + C1 - deltat
}

/** Sun's apparent longitude (radians, 0..2π) at Julian day jdn. */
function sunLongitude(jdn: number): number {
  const T = (jdn - 2451545.0) / 36525
  const T2 = T * T
  const dr = PI / 180
  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2
  let DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M)
  DL = DL + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.00029 * Math.sin(dr * 3 * M)
  let L = (L0 + DL) * dr
  L = L - PI * 2 * INT(L / (PI * 2))
  return L
}

/** Solar-term sector 0..11 at local midnight of day `dayNumber`. */
function getSunLongitude(dayNumber: number): number {
  return INT((sunLongitude(dayNumber - 0.5 - TZ / 24) / PI) * 6)
}

function getNewMoonDay(k: number): number {
  return INT(newMoon(k) + 0.5 + TZ / 24)
}

/** Day number of the start of lunar month 11 (the month containing the winter solstice) of year yy. */
function getLunarMonth11(yy: number): number {
  const off = jdFromDate(31, 12, yy) - 2415021
  const k = INT(off / 29.530588853)
  let nm = getNewMoonDay(k)
  if (getSunLongitude(nm) >= 9) nm = getNewMoonDay(k - 1)
  return nm
}

/** Offset (months after month 11) of the leap month in the lunar year starting at a11. */
function getLeapMonthOffset(a11: number): number {
  const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5)
  let last: number
  let i = 1
  let arc = getSunLongitude(getNewMoonDay(k + i))
  do {
    last = arc
    i++
    arc = getSunLongitude(getNewMoonDay(k + i))
  } while (arc !== last && i < 14)
  return i - 1
}

export function solarToLunar(dd: number, mm: number, yy: number): LunarDate {
  const dayNumber = jdFromDate(dd, mm, yy)
  const k = INT((dayNumber - 2415021.076998695) / 29.530588853)
  let monthStart = getNewMoonDay(k + 1)
  if (monthStart > dayNumber) monthStart = getNewMoonDay(k)
  let a11 = getLunarMonth11(yy)
  let b11 = a11
  let lunarYear: number
  if (a11 >= monthStart) {
    lunarYear = yy
    a11 = getLunarMonth11(yy - 1)
  } else {
    lunarYear = yy + 1
    b11 = getLunarMonth11(yy + 1)
  }
  const lunarDay = dayNumber - monthStart + 1
  const diff = INT((monthStart - a11) / 29)
  let leap = false
  let lunarMonth = diff + 11
  if (b11 - a11 > 365) {
    const leapMonthDiff = getLeapMonthOffset(a11)
    if (diff >= leapMonthDiff) {
      lunarMonth = diff + 10
      if (diff === leapMonthDiff) leap = true
    }
  }
  if (lunarMonth > 12) lunarMonth -= 12
  if (lunarMonth >= 11 && diff < 4) lunarYear -= 1
  return { day: lunarDay, month: lunarMonth, year: lunarYear, leap }
}

/** Returns null when (month, leap) does not exist in that lunar year. */
export function lunarToSolar(ld: number, lm: number, ly: number, leap = false): SolarDate | null {
  let a11: number
  let b11: number
  if (lm < 11) {
    a11 = getLunarMonth11(ly - 1)
    b11 = getLunarMonth11(ly)
  } else {
    a11 = getLunarMonth11(ly)
    b11 = getLunarMonth11(ly + 1)
  }
  const k = INT(0.5 + (a11 - 2415021.076998695) / 29.530588853)
  let off = lm - 11
  if (off < 0) off += 12
  if (b11 - a11 > 365) {
    const leapOff = getLeapMonthOffset(a11)
    let leapMonth = leapOff - 2
    if (leapMonth < 0) leapMonth += 12
    if (leap && lm !== leapMonth) return null
    if (leap || off >= leapOff) off += 1
  } else if (leap) {
    return null
  }
  const monthStart = getNewMoonDay(k + off)
  return jdToDate(monthStart + ld - 1)
}

/** Number of days in the given lunar month (29 or 30). */
export function lunarMonthLength(lm: number, ly: number, leap = false): number {
  const start = lunarToSolar(1, lm, ly, leap)
  if (!start) return 0
  const startJd = jdFromDate(start.day, start.month, start.year)
  const d30 = jdToDate(startJd + 29)
  return solarToLunar(d30.day, d30.month, d30.year).day === 1 ? 29 : 30
}

// ---- Can Chi (sexagenary names)

export const CAN = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'] as const
export const CHI = [
  'Tý',
  'Sửu',
  'Dần',
  'Mão',
  'Thìn',
  'Tỵ',
  'Ngọ',
  'Mùi',
  'Thân',
  'Dậu',
  'Tuất',
  'Hợi',
] as const
/** Vietnamese zodiac animals (note: Mão = Mèo/Cat, not Rabbit). */
export const ZODIAC = {
  vi: ['Chuột', 'Trâu', 'Hổ', 'Mèo', 'Rồng', 'Rắn', 'Ngựa', 'Dê', 'Khỉ', 'Gà', 'Chó', 'Lợn'],
  en: [
    'Rat',
    'Buffalo',
    'Tiger',
    'Cat',
    'Dragon',
    'Snake',
    'Horse',
    'Goat',
    'Monkey',
    'Rooster',
    'Dog',
    'Pig',
  ],
} as const

export function canChiYear(lunarYear: number): string {
  return `${CAN[(lunarYear + 6) % 10]} ${CHI[(lunarYear + 8) % 12]}`
}

/** Index into CHI / ZODIAC for a lunar year. */
export function zodiacIndex(lunarYear: number): number {
  return (lunarYear + 8) % 12
}

// ---- Festivals

export interface LunarFestival {
  day: number
  month: number
  name: { vi: string; en: string }
}

export const LUNAR_FESTIVALS: LunarFestival[] = [
  { day: 1, month: 1, name: { vi: 'Tết Nguyên Đán', en: 'Lunar New Year (Tết)' } },
  { day: 15, month: 1, name: { vi: 'Rằm tháng Giêng', en: 'Lantern Festival' } },
  { day: 10, month: 3, name: { vi: 'Giỗ Tổ Hùng Vương', en: "Hùng Kings' Commemoration Day" } },
  { day: 15, month: 4, name: { vi: 'Lễ Phật Đản', en: "Buddha's Birthday" } },
  { day: 5, month: 5, name: { vi: 'Tết Đoan Ngọ', en: 'Double Fifth Festival' } },
  { day: 15, month: 7, name: { vi: 'Rằm tháng Bảy (Vu Lan)', en: 'Vu Lan Festival' } },
  { day: 15, month: 8, name: { vi: 'Tết Trung Thu', en: 'Mid-Autumn Festival' } },
  { day: 23, month: 12, name: { vi: 'Ông Công Ông Táo', en: 'Kitchen Gods Day' } },
]

export function festivalOn(l: LunarDate): LunarFestival | undefined {
  if (l.leap) return undefined
  return LUNAR_FESTIVALS.find((f) => f.day === l.day && f.month === l.month)
}
