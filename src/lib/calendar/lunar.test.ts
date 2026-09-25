import { describe, expect, it } from 'vitest'
import {
  canChiYear,
  jdFromDate,
  jdToDate,
  lunarMonthLength,
  lunarToSolar,
  solarToLunar,
  ZODIAC,
  zodiacIndex,
} from './lunar'

describe('lunar calendar (UTC+7)', () => {
  it.each([
    // [solar d, m, y] -> [lunar d, m, y, leap]
    [
      [10, 2, 2024],
      [1, 1, 2024, false],
    ], // Tết Giáp Thìn
    [
      [29, 1, 2025],
      [1, 1, 2025, false],
    ], // Tết Ất Tỵ
    [
      [17, 2, 2026],
      [1, 1, 2026, false],
    ], // Tết Bính Ngọ
    [
      [22, 1, 2023],
      [1, 1, 2023, false],
    ], // Tết Quý Mão
    [
      [21, 1, 2023],
      [30, 12, 2022, false],
    ],
    [
      [6, 10, 2025],
      [15, 8, 2025, false],
    ], // Trung Thu 2025
    [
      [25, 7, 2025],
      [1, 6, 2025, true],
    ], // leap 6th month 2025
    [
      [22, 3, 2023],
      [1, 2, 2023, true],
    ], // leap 2nd month 2023
    [
      [24, 9, 2026],
      [14, 8, 2026, false],
    ],
    [
      [25, 9, 2026],
      [15, 8, 2026, false],
    ], // Trung Thu 2026
    [
      [17, 2, 2007],
      [1, 1, 2007, false],
    ], // VN Tết 2007 (China: 18/2)
  ] as const)('%j -> %j', ([d, m, y], [ld, lm, ly, leap]) => {
    expect(solarToLunar(d, m, y)).toEqual({ day: ld, month: lm, year: ly, leap })
  })

  it('converts lunar back to solar', () => {
    expect(lunarToSolar(1, 1, 2027)).toEqual({ day: 6, month: 2, year: 2027 })
    expect(lunarToSolar(15, 8, 2026)).toEqual({ day: 25, month: 9, year: 2026 })
    expect(lunarToSolar(1, 9, 2026)).toEqual({ day: 10, month: 10, year: 2026 })
    expect(lunarToSolar(1, 6, 2025, true)).toEqual({ day: 25, month: 7, year: 2025 })
    expect(lunarToSolar(1, 6, 2026, true)).toBeNull() // 2026 has no leap month
  })

  it('round-trips every day of 2024–2028', () => {
    const start = jdFromDate(1, 1, 2024)
    const end = jdFromDate(31, 12, 2028)
    for (let jd = start; jd <= end; jd++) {
      const s = jdToDate(jd)
      const l = solarToLunar(s.day, s.month, s.year)
      expect(lunarToSolar(l.day, l.month, l.year, l.leap)).toEqual(s)
    }
  })

  it('names years with Can Chi and Vietnamese zodiac', () => {
    expect(canChiYear(2026)).toBe('Bính Ngọ')
    expect(canChiYear(2027)).toBe('Đinh Mùi')
    expect(canChiYear(2023)).toBe('Quý Mão')
    expect(ZODIAC.vi[zodiacIndex(2023)]).toBe('Mèo')
    expect(ZODIAC.en[zodiacIndex(2026)]).toBe('Horse')
  })

  it('knows month lengths', () => {
    // Tháng 8 Bính Ngọ runs 11/9/2026 → 9/10/2026; tháng 9 starts 10/10.
    expect(lunarMonthLength(8, 2026)).toBe(29)
  })
})
