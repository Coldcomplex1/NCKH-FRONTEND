import { describe, expect, it } from 'vitest'
import { makeTok } from '../normalize'
import { evalNum, findNumberRuns } from '../numbers'

const words = (s: string): string[] => s.split(' ').map((w) => makeTok(w).text)
const runs = (s: string): [string, number][] => {
  const toks = s.split(' ').map((w) => makeTok(w))
  const numToks = toks.map((t) => ({ text: t.text, strip: t.strip, ascii: t.ascii, isOp: !!t.op }))
  return findNumberRuns(numToks).map((r) => [
    toks
      .slice(r.start, r.end)
      .map((t) => t.text)
      .join(' '),
    r.value,
  ])
}

describe('evalNum (spec §2 N11)', () => {
  it.each([
    ['một', 1],
    ['mười', 10],
    ['mười lăm', 15],
    ['hai mươi', 20],
    ['hai mươi mốt', 21],
    ['ba mươi tư', 34],
    ['một trăm linh năm', 105],
    ['một trăm lẻ năm', 105],
    ['hai trăm rưỡi', 250],
    ['hai trăm mốt', 210],
    ['hai nghìn không trăm hai mươi sáu', 2026],
    ['hai nghìn rưỡi', 2500],
    ['ba lăm', 35],
    ['hai tư', 24],
    ['nghìn hai', 1200],
    ['một triệu hai', 1_200_000],
    ['5 nghìn', 5000],
    ['2.5', 2.5],
    ['100', 100],
  ])('%s = %d', (s, n) => {
    expect(evalNum(words(s))).toBe(n)
  })

  it('rejects malformed runs', () => {
    expect(evalNum(words('hai ba'))).toBeNaN()
    expect(evalNum([])).toBeNaN()
  })
})

describe('findNumberRuns', () => {
  it('finds strong number words and digits', () => {
    expect(runs('nhảy ba lần')).toEqual([['ba', 3]])
    expect(runs('nhảy 3 lần')).toEqual([['3', 3]])
    expect(runs('quay hai mươi mốt vòng')).toEqual([['hai mươi mốt', 21]])
  })

  it('keeps "5 3" as two numbers', () => {
    expect(runs('5 cộng 3')).toEqual([
      ['5', 5],
      ['3', 3],
    ])
  })

  it('reads a range "hai ba lần" as its larger end', () => {
    expect(runs('nhảy hai ba lần')).toEqual([['hai ba', 3]])
  })

  it('needs numeric context for weak words', () => {
    expect(runs('năm nay là năm con gì')).toEqual([])
    expect(runs('năm cộng năm')).toEqual([
      ['năm', 5],
      ['năm', 5],
    ])
    expect(runs('nhảy năm lần')).toEqual([['năm', 5]])
    expect(runs('bạn khỏe không')).toEqual([])
    expect(runs('5 nhân không')).toEqual([
      ['5', 5],
      ['không', 0],
    ])
  })

  it('reads no-diacritics number words', () => {
    expect(runs('nhay ba lan')).toEqual([['ba', 3]])
    expect(runs('nhay sau lan')).toEqual([['sau', 6]])
    expect(runs('hai muoi mot')).toEqual([['hai muoi mot', 21]])
    expect(runs('mot tram muoi')).toEqual([['mot tram muoi', 110]])
    // "sau" (after) without a unit is not six
    expect(runs('nhay sau khi vay tay')).toEqual([])
  })

  it('never deletes the words ("nhảy một bài" still reads as a phrase)', () => {
    expect(runs('nhảy một bài')).toEqual([['một', 1]])
  })
})
