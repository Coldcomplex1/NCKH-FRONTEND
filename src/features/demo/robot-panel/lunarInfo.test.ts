import { describe, expect, it } from 'vitest'
import { lunarCountdown, lunarInfo } from './lunarInfo'

// 2026-09-24 (Vietnam) is lunar 14/8 Bính Ngọ; Trung Thu (15/8) is 2026-09-25; Tết 2027 is 2027-02-06.
const at = new Date('2026-09-24T08:35:00+07:00')

describe('lunarInfo', () => {
  it('computes the lunar date and year name in Vietnam time', () => {
    const info = lunarInfo(at)
    expect(info.solar).toMatchObject({ year: 2026, month: 9, day: 24 })
    expect(info.lunar).toMatchObject({ day: 14, month: 8, leap: false })
    expect(info.canChi).toBe('Bính Ngọ')
    expect(info.festival).toBeUndefined()
  })

  it('uses Vietnam time, not the device time zone (23:30 UTC is already the next day)', () => {
    expect(lunarInfo(new Date('2026-09-24T17:30:00Z')).solar.day).toBe(25)
  })

  it('finds festivals', () => {
    expect(lunarInfo(new Date('2026-09-25T12:00:00+07:00')).festival?.name.vi).toBe('Tết Trung Thu')
  })
})

describe('lunarCountdown', () => {
  it('days until rằm, mùng 1 and Tết', () => {
    expect(lunarCountdown(at, 'ram')).toMatchObject({ days: 1, target: { month: 9, day: 25 } })
    const tet = lunarCountdown(at, 'tet')
    expect(tet.target).toMatchObject({ year: 2027, month: 2, day: 6 })
    expect(tet.days).toBe(135)
    const mung1 = lunarCountdown(at, 'mung1')
    expect(mung1.days).toBeGreaterThanOrEqual(15)
    expect(mung1.days).toBeLessThanOrEqual(16)
    expect(lunarInfo(new Date(at.getTime() + mung1.days * 86_400_000)).lunar.day).toBe(1)
  })

  it('0 on the day itself', () => {
    expect(lunarCountdown(new Date('2027-02-06T09:00:00+07:00'), 'tet').days).toBe(0)
    expect(lunarCountdown(new Date('2026-09-25T09:00:00+07:00'), 'ram').days).toBe(0)
  })
})
