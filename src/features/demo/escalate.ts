import { actionCategory, type Action, type ActionType } from '@/core/actions'
import { deriveStatus, type ParsedAction, type ParseResult, type UnknownInfo } from '@/core/parser'
import type { MotionScript } from '@/motion/script'

/**
 * The AI-move router: after the (instant, offline) rule parse, which clauses should Qwen invent a
 * move for? Only body/face things — info, chat, smart home, refusals for safety or missing devices
 * and negated clauses never go to the AI.
 *
 * - 'unknown':   nothing matched ("moonwalk đi", "lộn nhào", "nhắm một mắt")
 *                → fallback: today's "chưa hiểu" reply (or "chưa nghĩ ra" when the AI failed);
 * - 'mime':      refused as physically impossible ("bay lên trời", "ăn chuối", "chơi đàn")
 *                → fallback: today's refusal + alternative;
 * - 'variation': a motion with words the rules ignored ("nhảy moonwalk", "vẫy tay trái",
 *                "nhảy thật cao", "đi như con cua") → fallback: the built-in move.
 */

export type EscalationKind = 'unknown' | 'mime' | 'variation'

export interface Escalation {
  clause: number
  /** The clause as the parser normalised it (dialect words rewritten). */
  text: string
  kind: EscalationKind
  /** The built-in motion the rules found (variations), a hint for the model. */
  hint: ActionType | null
}

export type MoveResult =
  | { kind: 'move'; move: MotionScript }
  | { kind: 'not_motion' }
  | { kind: 'refused' }
  | { kind: 'error'; reason: 'timeout' | 'network' | 'server' | 'rate_limited' | 'disabled' | 'aborted' }

/** At most this many clauses of one command go to the AI. */
export const MAX_ESCALATIONS = 3

/** Physical refusals that stay refusals: real-world help, or things not to act out. */
const NO_MIME = new Set([
  'smoke',
  'give massages',
  'help anyone up',
  'feed anyone',
  'get married',
  'go out',
  'go shopping',
  'buy',
  'find things',
])

/**
 * Information questions ("con mèo màu gì", "thủ đô nước Pháp là gì", "bao nhiêu tiền") are not
 * moves: they keep today's "chưa hiểu" reply without a detour through the thinking pose. A yes/no
 * question ("bạn biết moonwalk không?") still goes to the AI, which may simply show the move.
 */
const QUESTION_WORDS =
  /(^|\s)(gì|bao nhiêu|bao lâu|tại sao|vì sao|làm sao|ở đâu|mấy|ai|bao nhieu|bao lau|tai sao|vi sao|o dau|la gi)(\s|$)/u

/**
 * Leftover words that never make a variation: people, politeness, "a bit", "again"… (most are
 * fillers in the lexicon already; these are the ones a motion clause can still leave over).
 */
const HARMLESS = new Set(
  [
    'mình',
    'tôi',
    'tui',
    'tớ',
    'tao',
    'em',
    'anh',
    'chị',
    'bạn',
    'cậu',
    'con',
    'cháu',
    'ông',
    'bà',
    'cho',
    'giùm',
    'giúp',
    'dùm',
    'hộ',
    'xem',
    'coi',
    'thử',
    'với',
    'đi',
    'nào',
    'luôn',
    'ngay',
    'liền',
    'lại',
    'cái',
    'chút',
    'tí',
    'rồi',
    'thêm',
    'nữa',
    'cũng',
    'vậy',
    'thế',
    'đó',
    'này',
    'hãy',
    'được',
    'đâu',
    'ơi',
    'robot',
    'ronaldo',
    'please',
    'ok',
  ].flatMap((w) => [w, strip(w)]),
)

/** Words that describe HOW to move: "đi như con cua", "nhảy kiểu robot", "chạy giống siêu nhân". */
const MANNER = new Set(['như', 'giống', 'kiểu', 'nhu', 'giong', 'kieu'])

function strip(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
}

const isMotion = (a: Action) => actionCategory(a.type) === 'motion'

function meaningful(words: readonly string[]): string[] {
  return words.filter((w) => !HARMLESS.has(w.toLowerCase()) && !/^\d+$/.test(w))
}

/** The clauses Qwen should invent a move for, in clause order (at most MAX_ESCALATIONS). */
export function planEscalations(parse: ParseResult): Escalation[] {
  const out: Escalation[] = []
  parse.clauses.forEach((c, clause) => {
    if (out.length >= MAX_ESCALATIONS) return
    if (c.negated || c.hasNegator) return
    const acts = parse.actions.filter((a) => a.clause === clause).map((a) => a.action)
    const unknown = parse.unknown.some((u) => u.clause === clause && u.reason !== 'empty')
    const words = c.unexplained ?? []
    if (acts.length === 0) {
      if (unknown && words.length > 0 && !QUESTION_WORDS.test(c.text.toLowerCase()))
        out.push({ clause, text: c.text, kind: 'unknown', hint: null })
      return
    }
    if (acts.some((a) => a.type === 'unsupported' && a.reason === 'physical' && !NO_MIME.has(a.verb.en))) {
      if (acts.every((a) => a.type === 'unsupported' || isMotion(a)))
        out.push({ clause, text: c.text, kind: 'mime', hint: null })
      return
    }
    const motions = acts.filter(isMotion)
    if (motions.length !== acts.length || acts.some((a) => a.type === 'stop' || a.type === 'custom_move'))
      return
    const tokens = c.text.split(/\s+/)
    const manner = tokens.some((t, i) => MANNER.has(t.toLowerCase()) && i < tokens.length - 1)
    if (manner || meaningful(words).length > 0)
      out.push({ clause, text: c.text, kind: 'variation', hint: motions[0]!.type })
  })
  return out
}

/** A generic verb for a refusal Qwen decided on (never the user's own words). */
const UNSAFE_VERB = { vi: 'làm việc đó', en: 'do that' }

/**
 * Puts the AI results back into the parse, in clause order. A move replaces whatever the rules
 * made of that clause; everything else falls back as described above. Status, confidence and
 * suggestions are re-derived.
 */
export function mergeMoves(
  parse: ParseResult,
  escalations: readonly Escalation[],
  results: readonly MoveResult[],
): ParseResult {
  const replace = new Map<number, ParsedAction[]>()
  const resolved = new Set<number>()
  escalations.forEach((e, i) => {
    const r = results[i]
    if (!r) return
    const at = (action: Action, confidence: number): ParsedAction => ({
      action,
      confidence,
      matched: e.text,
      clause: e.clause,
      source: 'llm',
    })
    if (r.kind === 'move') {
      replace.set(e.clause, [at({ type: 'custom_move', move: r.move, count: 1 }, 0.9)])
      resolved.add(e.clause)
    } else if (e.kind === 'unknown' && r.kind === 'refused') {
      replace.set(e.clause, [at({ type: 'unsupported', reason: 'unsafe', verb: UNSAFE_VERB }, 0.9)])
      resolved.add(e.clause)
    } else if (
      e.kind === 'unknown' &&
      r.kind === 'error' &&
      r.reason !== 'aborted' &&
      r.reason !== 'disabled'
    ) {
      replace.set(e.clause, [at({ type: 'clarify', need: 'move_failed' }, 0.9)])
      resolved.add(e.clause)
    }
  })
  if (replace.size === 0) return parse

  const actions: ParsedAction[] = []
  const pending = [...replace.keys()].sort((a, b) => a - b)
  const flushUpTo = (clause: number) => {
    while (pending.length > 0 && pending[0]! <= clause) actions.push(...replace.get(pending.shift()!)!)
  }
  for (const a of parse.actions) {
    flushUpTo(a.clause)
    if (!replace.has(a.clause)) actions.push(a)
  }
  flushUpTo(Number.POSITIVE_INFINITY)

  const unknown: UnknownInfo[] = parse.unknown.filter((u) => !resolved.has(u.clause))
  return {
    ...parse,
    parser: `${parse.parser}+qwen`,
    actions,
    unknown,
    suggestions: unknown.length > 0 ? parse.suggestions : [],
    confidence: actions.length ? Math.min(...actions.map((a) => a.confidence)) : 0,
    status: deriveStatus(actions, unknown),
  }
}
