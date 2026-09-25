import { describe, expect, it } from 'vitest'
import { results } from '@/content/results'
import {
  collapseRepeats,
  tokenize,
  trimPunct,
  truncateSegments,
  visibleWords,
  type Segment,
} from './collapseRepeats'

const collapse = (text: string) => collapseRepeats(tokenize(text), { maxN: 4, minRun: 5 })
const repeats = (segs: Segment[]) =>
  segs.flatMap((s) => (s.kind === 'repeat' ? [`${s.unit.join(' ')}×${s.count}`] : []))

describe('collapseRepeats', () => {
  it('collapses a 2-word loop into one pill', () => {
    const text = `Xin cảm ơn ${'ủng hộ '.repeat(27)}nhé`
    const segs = collapse(text)
    expect(repeats(segs)).toEqual(['ủng hộ×27'])
    expect(segs[0]).toEqual({ kind: 'text', tokens: ['Xin', 'cảm', 'ơn'] })
    expect(segs[2]).toEqual({ kind: 'text', tokens: ['nhé'] })
  })

  it('keeps short natural repeats as written', () => {
    expect(collapse('rất rất vui, đi đi đi')).toEqual([
      { kind: 'text', tokens: ['rất', 'rất', 'vui,', 'đi', 'đi', 'đi'] },
    ])
  })

  it('matches across case and edge punctuation, and trims the unit', () => {
    const segs = collapse('Hội, hội hội. hội hội hội')
    expect(repeats(segs)).toEqual(['Hội×6'])
  })

  it('prefers the n-gram that covers the most tokens (smaller n on ties)', () => {
    expect(repeats(collapse('a a a a a a'))).toEqual(['a×6'])
    expect(repeats(collapse(`${'cây này được trồng '.repeat(6)}`))).toEqual(['cây này được trồng×6'])
  })

  it('never matches pure punctuation tokens', () => {
    expect(repeats(collapse('— — — — — —'))).toEqual([])
  })

  it('shrinks the real repetition loops in the worst examples', () => {
    const [first, second] = results.examples
    const loops1 = repeats(collapse(first!.prediction))
    expect(loops1.some((r) => /^ủng hộ×\d+$/.test(r))).toBe(true)
    const hoi = collapse(first!.prediction).find((s) => s.kind === 'repeat' && s.unit.join(' ') === 'hội')
    expect(hoi && hoi.kind === 'repeat' && hoi.count).toBeGreaterThan(50)
    const loop2 = collapse(second!.prediction).find((s) => s.kind === 'repeat')
    // The loop's phase depends on where it starts ("được trồng cây này …"); its words do not.
    expect(loop2?.kind === 'repeat' && [...loop2.unit].sort()).toEqual(['cây', 'này', 'được', 'trồng'].sort())
  })

  it('does not change the reference transcripts except for real loops (text kept exactly)', () => {
    const ref = results.examples[0]!.reference
    const segs = collapse(ref)
    expect(repeats(segs)).toEqual([])
    expect(segs.flatMap((s) => (s.kind === 'text' ? s.tokens : [])).join(' ')).toBe(tokenize(ref).join(' '))
    expect(ref).toContain('<ệ')
  })
})

describe('truncateSegments', () => {
  it('cuts after N visible words and never splits a pill', () => {
    const segs = collapse(`một hai ba ${'ủng hộ '.repeat(10)}bốn năm`)
    expect(visibleWords(segs)).toBe(7)
    expect(truncateSegments(segs, 4)).toEqual({ segments: [segs[0]], truncated: true })
    expect(truncateSegments(segs, 5).segments).toHaveLength(2)
    expect(truncateSegments(segs, 7)).toEqual({ segments: segs, truncated: false })
  })

  it('cuts inside a text segment', () => {
    const { segments, truncated } = truncateSegments(collapse('a b c d e'), 2)
    expect(truncated).toBe(true)
    expect(segments).toEqual([{ kind: 'text', tokens: ['a', 'b'] }])
  })
})

it('trimPunct strips edge punctuation only', () => {
  expect(trimPunct('“hộ,”')).toBe('hộ')
  expect(trimPunct('BĐR')).toBe('BĐR')
})
