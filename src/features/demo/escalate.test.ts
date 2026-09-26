import { describe, expect, it } from 'vitest'
import { THINKING } from '@/motion/builtins'
import { ALL_GROUPS } from '@/nlu/__tests__/cases'
import { makeCtx } from '@/nlu/__tests__/ctx'
import { parseSync } from '@/nlu/ruleParser'
import { mergeMoves, planEscalations, type MoveResult } from './escalate'
import { AI_EXAMPLES } from './input-panel/examples'

const parse = (text: string) => parseSync(text, makeCtx())
const route = (text: string) =>
  planEscalations(parse(text)).map((e) => `${e.kind}:${e.clause}${e.hint ? `:${e.hint}` : ''}`)

describe('planEscalations — which clauses Qwen invents a move for', () => {
  it.each([
    ['moonwalk đi', ['unknown:0']],
    ['backflip', ['unknown:0']],
    ['lộn nhào đi', ['unknown:0']],
    ['nhắm 1 mắt đi', ['unknown:0']],
    ['nháy mắt đi', ['unknown:0']],
    ['hít đất', ['unknown:0']],
    ['bạn biết moonwalk không', ['unknown:0']],
    ['nhảy moonwalk', ['variation:0:jump']],
    ['đi như con cua', ['variation:0:walk']],
    ['vẫy tay trái', ['variation:0:wave']],
    ['nhảy thật cao', ['variation:0:jump']],
    ['chống đẩy', ['variation:0:wave']], // the rules misread it as a wave
    ['bay lên trời', ['mime:0']],
    ['ăn chuối', ['mime:0']],
    ['chơi đàn guitar', ['mime:0']],
    ['nhảy 3 lần rồi lộn nhào', ['unknown:1']],
  ])('%s → %j', (text, expected) => {
    expect(route(text)).toEqual(expected)
  })

  it.each([
    'đừng lộn nhào', // negated
    'hút thuốc đi', // never acted out
    'đi chợ', // real-world errand
    'mua chuoi',
    'đỡ bà dậy',
    'hát một bài', // out of scope: a refusal, not a move
    'đánh tôi đi', // unsafe
    'mấy giờ rồi',
    'bật đèn',
    'nhảy 3 lần',
    'nhắm mắt đi', // a built-in: sleep
    'Ronaldo ơi nhảy đi',
    'nhảy giùm mình cái',
    'cho mình xem bạn nhảy nào',
    'gật đầu 2 cái',
    'con mèo màu gì', // information questions keep the "chưa hiểu" reply
    'thủ đô nước Pháp là gì',
    'chi phí bao nhiêu',
  ])('never: %s', (text) => {
    expect(route(text)).toEqual([])
  })

  it.each(AI_EXAMPLES.map((c) => c.vi))('the AI example chip "%s" goes to the AI', (text) => {
    expect(route(text)).not.toEqual([])
  })

  it('caps the number of AI clauses per command', () => {
    expect(route('lộn nhào rồi moonwalk rồi backflip rồi hít đất')).toHaveLength(3)
  })

  it('regression sweep: every existing parser case keeps its rule result, except these reviewed ones', () => {
    const REVIEWED = new Set([
      // physical refusals that are now acted out
      'ăn một quả chuối',
      'an mot qua chuoi',
      'ăn phở',
      'ăn bánh mì đi',
      'uống nước đi',
      'uống cà phê',
      'uống một ly trà',
      'bay lên trời đi',
      'đánh răng',
      'nấu cơm giùm tui',
      'ăn chuối rồi nhảy',
      'ăn con khủng long',
      // not understood at all
      'xyz abc',
      'nhảy và xyz',
    ])
    const escalated = new Set<string>()
    for (const [, cases] of ALL_GROUPS) {
      for (const c of cases) {
        if (planEscalations(parseSync(c.in, makeCtx(c.ctx))).length > 0) escalated.add(c.in)
      }
    }
    expect([...escalated].sort()).toEqual([...REVIEWED].sort())
  })
})

describe('mergeMoves', () => {
  const MOVE: MoveResult = { kind: 'move', move: THINKING }
  const merge = (text: string, results: MoveResult[]) => {
    const p = parse(text)
    return mergeMoves(p, planEscalations(p), results)
  }
  const types = (r: ReturnType<typeof merge>) => r.actions.map((a) => `${a.action.type}@${a.clause}`)

  it('a move fills an unknown clause, in clause order', () => {
    const r = merge('nhảy 3 lần rồi lộn nhào', [MOVE])
    expect(types(r)).toEqual(['jump@0', 'custom_move@1'])
    expect(r.actions[1]!.source).toBe('llm')
    expect(r.unknown).toEqual([])
    expect(r.suggestions).toEqual([])
    expect(r.status).toBe('ok')
    expect(r.parser).toBe('rule-v1+qwen')
  })

  it('a move replaces a variation or a physical refusal', () => {
    expect(types(merge('vẫy tay trái', [MOVE]))).toEqual(['custom_move@0'])
    expect(types(merge('bay lên trời', [MOVE]))).toEqual(['custom_move@0'])
  })

  it('fallbacks: built-in move, refusal, "chưa nghĩ ra", or "chưa hiểu"', () => {
    const err: MoveResult = { kind: 'error', reason: 'timeout' }
    expect(types(merge('vẫy tay trái', [err]))).toEqual(['wave@0'])
    expect(types(merge('bay lên trời', [err]))).toEqual(['unsupported@0'])
    const failed = merge('lộn nhào đi', [err])
    expect(failed.actions[0]!.action).toEqual({ type: 'clarify', need: 'move_failed' })
    expect(failed.status).toBe('ok')
    const notMotion = merge('lộn nhào đi', [{ kind: 'not_motion' }])
    expect(notMotion.actions).toEqual([])
    expect(notMotion.status).toBe('unknown')
    // the feature is off (no key, static host): exactly today's behaviour
    const off = merge('lộn nhào đi', [{ kind: 'error', reason: 'disabled' }])
    expect(off.status).toBe('unknown')
  })

  it('a refusal from the model becomes the generic "not safe" reply (never the user’s words)', () => {
    const r = merge('lộn nhào đi', [{ kind: 'refused' }])
    expect(r.actions[0]!.action).toEqual({
      type: 'unsupported',
      reason: 'unsafe',
      verb: { vi: 'làm việc đó', en: 'do that' },
    })
    expect(r.status).toBe('impossible')
  })
})
