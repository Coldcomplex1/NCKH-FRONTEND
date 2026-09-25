import { describe, expect, it } from 'vitest'
import { makeFmt } from './format'

describe('makeFmt', () => {
  const vi = makeFmt('vi')
  const en = makeFmt('en')
  it('formats percents with locale separators', () => {
    expect(vi.pct(0.07844676610906455).replace(/\s/g, '')).toBe('7,84%')
    expect(en.pct(0.07844676610906455)).toBe('7.84%')
  })
  it('rounds half-expand (Intl default), which can differ from the dashboard by 0.01pp', () => {
    // Source value is 7.475% (4 dp). Intl half-expand rounds to 7.48%; the linked dashboard
    // computes (7.475).toFixed(2), which floating-point represents as 7.47% — a binary-float
    // toFixed artifact, not a discrepancy in the underlying data.
    expect(en.pct(0.07475)).toBe('7.48%')
  })
  it('groups thousands', () => {
    expect(vi.int(2026)).toBe('2.026')
    expect(en.int(2026)).toBe('2,026')
  })
  it('drops trailing zeros for math results', () => {
    expect(vi.numFlex(2.5)).toBe('2,5')
    expect(en.numFlex(8)).toBe('8')
  })
})
