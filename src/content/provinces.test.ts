import { describe, expect, it } from 'vitest'
import { PROVINCES, isProvinceId, provinceName } from './provinces'
import { results } from './results'

describe('provinces', () => {
  it('names all 63 ViMD provinces in the data', () => {
    expect(Object.keys(PROVINCES)).toHaveLength(63)
    expect(results.provinces).toHaveLength(63)
    expect(results.provinces.map((p) => p.id).filter((id) => !isProvinceId(id))).toEqual([])
    expect(results.examples.map((e) => e.province).filter((id) => !isProvinceId(id))).toEqual([])
  })

  it('has Vietnamese diacritics and dashboard-style English names', () => {
    expect(provinceName('SonLa', 'vi')).toBe('Sơn La')
    expect(provinceName('QuangBinh', 'vi')).toBe('Quảng Bình')
    expect(provinceName('QuangBinh', 'en')).toBe('Quang Binh')
    expect(provinceName('ThuaThienHue', 'vi')).toBe('Thừa Thiên Huế')
    expect(provinceName('BaRiaVungTau', 'vi')).toBe('Bà Rịa – Vũng Tàu')
    expect(provinceName('HoChiMinh', 'vi')).toBe('TP. Hồ Chí Minh')
    expect(provinceName('DakLak', 'vi')).toBe('Đắk Lắk')
    expect(provinceName('KhanhHoa', 'vi')).toBe('Khánh Hòa')
  })

  it('falls back to a readable name for unknown keys', () => {
    expect(provinceName('NewPlace', 'vi')).toBe('New Place')
    expect(isProvinceId('toString')).toBe(false)
  })
})
