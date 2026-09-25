import { describe, expect, it } from 'vitest'
import type { Substitution } from '@/core/parser'
import { highlightSegments, uniqueSubstitutions } from './highlight'

const sub = (p: Partial<Substitution> & Pick<Substitution, 'start' | 'end'>): Substitution => ({
  from: 'x',
  to: 'y',
  kind: 'dialect',
  ...p,
})

describe('highlightSegments', () => {
  it('splits the normalized text at the substitution offsets', () => {
    const text = 'bây giờ mấy giờ rồi vậy'
    const segs = highlightSegments(text, [sub({ start: 20, end: 23 }), sub({ start: 0, end: 7 })])
    expect(segs.map((s) => [s.text, !!s.sub])).toEqual([
      ['bây giờ', true],
      [' mấy giờ rồi ', false],
      ['vậy', true],
    ])
    expect(segs.map((s) => s.text).join('')).toBe(text)
  })

  it('ignores out-of-range, empty and overlapping offsets instead of throwing', () => {
    const text = 'bật đèn'
    const segs = highlightSegments(text, [
      sub({ start: 0, end: 3 }),
      sub({ start: 2, end: 5 }), // overlaps
      sub({ start: 4, end: 4 }), // empty
      sub({ start: 5, end: 99 }), // out of range
      sub({ start: -1, end: 2 }),
    ])
    expect(segs.map((s) => [s.text, !!s.sub])).toEqual([
      ['bật', true],
      [' đèn', false],
    ])
  })

  it('no substitutions → one plain segment; empty text → nothing', () => {
    expect(highlightSegments('xin chào', [])).toEqual([{ text: 'xin chào' }])
    expect(highlightSegments('', [])).toEqual([])
  })
})

describe('uniqueSubstitutions', () => {
  it('drops duplicates and identity rewrites', () => {
    const a = sub({ from: 'rứa', to: 'vậy', start: 0, end: 3 })
    const b = sub({ from: 'rứa', to: 'vậy', start: 10, end: 13 })
    const same = sub({ from: 'đèn', to: 'đèn', start: 5, end: 8 })
    expect(uniqueSubstitutions([a, b, same])).toEqual([a])
  })
})
