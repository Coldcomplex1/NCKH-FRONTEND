import { describe, expect, it } from 'vitest'
import type { Action } from '@/core/actions'
import type { ParseResult } from '@/core/parser'
import { ALL_EXAMPLES } from '@/features/demo/input-panel/examples'
import { getParser, parseSync, RULE_PARSER_ID } from '../index'
import { DEFAULT_SUGGESTIONS, EXEMPLARS, SLOT_SUGGESTIONS } from '../lexicon/exemplars'
import { PROVINCES } from '../lexicon/places'
import { ALL_GROUPS, type Case, type Expected } from './cases'
import { makeCtx, type CtxPatch } from './ctx'
import results from '@/content/results.json'

const parse = (text: string, p?: CtxPatch): ParseResult => parseSync(text, makeCtx(p))

/** Weather places are compared by id; everything else as is. */
function shape(a: Action): Expected {
  if (a.type === 'weather')
    return { type: 'weather', place: a.place?.id ?? null, dayOffset: a.dayOffset, aspect: a.aspect }
  return a
}

/** Invariants that hold for every input. */
function invariants(r: ParseResult): string[] {
  const bad: string[] = []
  for (const s of r.substitutions) {
    if (r.normalizedText.slice(s.start, s.end) !== s.to) bad.push(`substitution offsets of ${s.from}→${s.to}`)
  }
  if (r.parser !== RULE_PARSER_ID) bad.push('parser id')
  for (const a of r.actions)
    if (a.confidence < 0.55 || a.confidence > 1) bad.push(`confidence ${a.confidence}`)
  return bad
}

describe.each(ALL_GROUPS)('parser table: %s', (_name, cases) => {
  it.each(cases.map((k): [string, Case] => [k.in || '(empty)', k]))('%s', (_label, k) => {
    const r = parse(k.in, k.ctx)
    expect(r.actions.map((a) => shape(a.action))).toEqual(k.out)
    expect(r.notes.map((n) => n.kind).sort()).toEqual([...(k.notes ?? [])].sort())
    expect(r.unknown.length > 0).toBe(k.unknown === true)
    expect(invariants(r)).toEqual([])
  })
})

describe('parse result details', () => {
  it('records dialect substitutions with character offsets and region hints', () => {
    const r = parse('chừ mấy giờ rồi rứa?')
    expect(r.normalizedText).toBe('bây giờ mấy giờ rồi vậy')
    expect(r.substitutions.map((s) => [s.from, s.to, s.kind])).toEqual([
      ['chừ', 'bây giờ', 'dialect'],
      ['rứa', 'vậy', 'dialect'],
    ])
    expect(r.substitutions[0]).toMatchObject({ start: 0, end: 7 })
    expect(r.dialectHints).toEqual({ central: 2 })
    expect(r.status).toBe('ok')
  })

  it('credits Nghệ Tĩnh for "bựa ni" and the South for "quẹo"', () => {
    expect(parse('bựa ni thứ mấy?').dialectHints).toEqual({ ngheTinh: 1 })
    expect(parse('quẹo trái').dialectHints).toEqual({ southern: 1 })
    // "coi" is both Central and Southern: nothing else tells them apart
    expect(parse('mở đèn lên coi').dialectHints).toEqual({ southern: 1, central: 1 })
    expect(parse('mi tắt đèn coi').dialectHints).toEqual({ central: 2 })
  })

  it('records typo corrections as spelling / phonetic / fuzzy substitutions', () => {
    const kinds = (t: string): string[] => parse(t).substitutions.map((s) => `${s.from}>${s.to}:${s.kind}`)
    expect(kinds('tắc đèn')).toEqual(['tắc>tắt:phonetic'])
    // hỏi/ngã/nặng and n/ng, t/c are regional sound mergers: phonetic, with the regions
    expect(kinds('vẩy tay')).toEqual(['vẩy>vẫy:phonetic'])
    expect(parse('nhạy ba lần').substitutions[0]).toMatchObject({
      kind: 'phonetic',
      region: ['central', 'southern'],
    })
    expect(parse('dẫy tay').substitutions[0]).toMatchObject({ kind: 'phonetic', region: ['southern'] })
    expect(kinds('nahy')).toEqual(['nahy>nhảy:fuzzy'])
  })

  it('restores diacritics for display in no-diacritics input', () => {
    const r = parse('bat quat len')
    expect(r.inputMode).toBe('ascii')
    expect(r.normalizedText).toBe('bật quạt lên')
    expect(r.substitutions).toEqual([])
    expect(r.coreText).toBe('bật quạt')
  })

  it('keeps words that only look like dialect ("chi phí", "mô hình")', () => {
    expect(parse('chi phí bao nhiêu').normalizedText).toBe('chi phí bao nhiêu')
    expect(parse('mô hình của bạn là gì').normalizedText).toBe('mô hình của bạn là gì')
  })

  it('derives the status from actions and unknown parts', () => {
    expect(parse('bật đèn').status).toBe('ok')
    expect(parse('ăn một quả chuối').status).toBe('impossible')
    expect(parse('ăn chuối rồi nhảy').status).toBe('partial')
    expect(parse('xyz abc').status).toBe('unknown')
  })

  it('reports clauses with question and negation flags', () => {
    const r = parse('mấy giờ rồi, đừng nhảy')
    expect(r.clauses).toEqual([
      { text: 'mấy giờ rồi', negated: false, question: false, unexplained: [], hasNegator: false },
      { text: 'đừng nhảy', negated: true, question: false, unexplained: [], hasNegator: true },
    ])
    expect(parse('bạn khỏe không?').clauses[0]?.question).toBe(true)
  })

  it('gives slot chips for a verb without a device', () => {
    const r = parse('bật lên')
    expect(r.unknown[0]?.reason).toBe('low_confidence')
    expect(r.suggestions.map((s) => s.say)).toEqual(['bật đèn', 'bật quạt'])
  })

  it('offers the default chips when nothing looks like a command', () => {
    for (const t of ['', 'xyz abc']) {
      expect(parse(t).suggestions.map((s) => s.say)).toEqual([
        'nhảy 3 lần',
        'mấy giờ rồi',
        'bật đèn',
        'kể chuyện cười',
      ])
    }
    for (const s of parse('xyz abc').suggestions) expect(s.label.en.length).toBeGreaterThan(0)
  })

  it('asks "xanh lá hay xanh dương?" through chips for plain "xanh"', () => {
    expect(parse('bật đèn màu xanh').suggestions.map((s) => s.say)).toEqual(['đèn xanh lá', 'đèn xanh dương'])
  })

  it('suggests a joke when the user is sad', () => {
    expect(parse('tôi buồn quá').suggestions.map((s) => s.say)).toEqual(['kể chuyện cười'])
  })

  it('never echoes arbitrary user text in an unsupported action', () => {
    for (const t of [
      'ăn con khủng long',
      'uống thuốc độc abcxyz',
      'gọi điện cho Nguyễn Văn A',
      'mua cái điện thoại iphone',
    ]) {
      const r = parse(t)
      const unsupported = r.actions.filter((a) => a.action.type === 'unsupported')
      expect(unsupported.length).toBeGreaterThan(0)
      const json = JSON.stringify(unsupported.map((a) => a.action))
      for (const word of ['khủng', 'độc', 'abcxyz', 'Nguyễn', 'iphone']) expect(json).not.toContain(word)
    }
  })

  it('truncates long input with a note', () => {
    const r = parse(`${'nhảy '.repeat(60)}`)
    expect(r.notes.map((n) => n.kind)).toContain('truncated')
    expect(r.actions.length).toBeGreaterThan(0)
  })

  it('bounds the number of parsed actions', () => {
    const r = parse(
      'nhảy rồi vẫy tay rồi gật đầu rồi lắc đầu rồi ngồi xuống rồi đứng lên rồi nhảy rồi múa rồi chạy rồi lùi rồi quay trái rồi quay phải rồi nhảy rồi nhảy',
    )
    expect(r.actions.length).toBeLessThanOrEqual(12)
    expect(r.actions.length).toBeGreaterThan(6)
  })

  it('reports confidence as the minimum over actions', () => {
    const r = parse('nahy rồi vẫy tay')
    expect(r.confidence).toBe(Math.min(...r.actions.map((a) => a.confidence)))
    expect(r.confidence).toBeLessThan(1)
    expect(parse('xyz').confidence).toBe(0)
  })

  it('lists the matched words of each action', () => {
    const r = parse('hãy nhảy 3 lần nhé')
    expect(r.actions[0]).toMatchObject({ matched: 'nhảy 3 lần', clause: 0, source: 'rule' })
    expect(parse('bật đèn và quạt').actions[1]?.source).toBe('carry')
    expect(parse('lần nữa', { last: [{ type: 'jump', count: 1 }] }).actions[0]?.source).toBe('repeat')
  })
})

describe('gazetteer', () => {
  it('covers all 63 ViMD provinces with coordinates', () => {
    const ids = (results as { provinces: { id: string }[] }).provinces.map((p) => p.id).sort()
    expect(ids).toHaveLength(63)
    expect(PROVINCES.map((p) => p.id).sort()).toEqual(ids)
    for (const p of PROVINCES) {
      expect(p.lat).toBeGreaterThan(8)
      expect(p.lat).toBeLessThan(24)
      expect(p.lon).toBeGreaterThan(102)
      expect(p.lon).toBeLessThan(110)
    }
  })

  it('finds every province by its own name, with or without diacritics', () => {
    const strip = (s: string): string =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    const found = (name: string): string | undefined => {
      const a = parse(`thời tiết ${name}`).actions[0]?.action
      return a?.type === 'weather' ? a.place?.id : undefined
    }
    const misses = PROVINCES.flatMap((p) => [p.vi, strip(p.vi)].filter((name) => found(name) !== p.id))
    expect(misses).toEqual([])
  })
})

describe('suggestion chips are commands the parser understands', () => {
  const all = [...EXEMPLARS, ...DEFAULT_SUGGESTIONS, ...Object.values(SLOT_SUGGESTIONS).flat()]
  it.each(all.map((s) => [s.say]))('%s', (say) => {
    const r = parse(say)
    expect(r.unknown).toEqual([])
    expect(r.actions.length).toBeGreaterThan(0)
  })
})

describe('demo example chips', () => {
  it.each(ALL_EXAMPLES.map((s) => [s]))('%s parses fully', (s) => {
    const r = parse(s)
    expect(r.unknown).toEqual([])
    expect(r.actions.length).toBeGreaterThan(0)
  })
})

describe('CommandParser', () => {
  it('is a singleton rule parser', async () => {
    const p = getParser()
    expect(p).toBe(getParser())
    expect(p.id).toBe('rule-v1')
    const r = await p.parse('nhảy', makeCtx())
    expect(r.actions[0]?.action).toEqual({ type: 'jump', count: 1 })
  })

  it('rejects when the signal is already aborted', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(getParser().parse('nhảy', makeCtx(), { signal: ac.signal })).rejects.toThrow('Parse aborted')
  })

  it('keeps the best of the ASR n-best hypotheses', async () => {
    const r = await getParser().parse('nhai ba lang', makeCtx(), {
      source: 'asr',
      alternatives: ['nhảy ba lần'],
    })
    expect(r.actions.map((a) => a.action)).toEqual([{ type: 'jump', count: 3 }])
  })
})

describe('performance', () => {
  it('parses the whole table quickly', () => {
    const inputs = ALL_GROUPS.flatMap(([, cs]) => cs.map((k) => k.in))
    parse('khởi động') // build the lexicon once
    const t0 = performance.now()
    for (let k = 0; k < 3; k++) for (const s of inputs) parse(s)
    const perParse = (performance.now() - t0) / (inputs.length * 3)
    expect(perParse).toBeLessThan(15)
  })
})
