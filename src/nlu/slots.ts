import type { ActionOf, MathOp, MathToken } from '@/core/actions'
import type { Bilingual } from '@/core/lang'
import type { PlaceRef } from '@/core/places'
import type { PlaceEntry } from './lexicon/places'
import { CLASSIFIERS, OBJECTS, TIMER_LABELS } from './lexicon/unsupported'
import type { NumRun } from './numbers'
import { canonSyl, strip } from './text'
import type { Tok } from './types'

// ------------------------------------------------------------------------------------------ math

/** Spoken operators (spec §4.3 Math). "thêm"/"bớt" count only between two numbers. */
const OP_WORDS: [string[], MathOp][] = [
  [['nhân', 'với'], '*'],
  [['chia', 'cho'], '/'],
  [['cộng'], '+'],
  [['trừ'], '-'],
  [['nhân'], '*'],
  [['nhơn'], '*'],
  [['chia'], '/'],
  [['thêm'], '+'],
  [['bớt'], '-'],
]
const TRAILERS = [
  'bằng mấy',
  'bằng bao nhiêu',
  'là mấy',
  'là bao nhiêu',
  'ra bao nhiêu',
  'ra mấy',
  'được mấy',
  'được bao nhiêu',
  'bằng',
  'là',
  '=',
  'mấy',
  'bao nhiêu',
]
  .map((s) => s.split(' ').map((x) => canonSyl(x)))
  .sort((a, b) => b.length - a.length)

const tokIs = (t: Tok | undefined, word: string): boolean =>
  !!t && (t.text === word || (t.ascii && t.strip === strip(word)))

function opAt(toks: readonly Tok[], i: number): { op: MathOp; len: number } | null {
  const t = toks[i]
  if (!t) return null
  if (t.op && t.op !== '=') return { op: t.op, len: 1 }
  for (const [words, op] of OP_WORDS) {
    if (words.every((wd, k) => tokIs(toks[i + k], wd))) return { op, len: words.length }
  }
  return null
}

export interface MathHit {
  start: number
  /** exclusive, including the trailer ("bằng mấy") */
  end: number
  action: ActionOf<'math'>
}

/** Find `NUM (OP NUM)+` (spec §4.3); × and ÷ bind tighter than + and −. */
export function findMath(toks: readonly Tok[], runs: readonly NumRun[]): MathHit | null {
  const runAt = new Map(runs.map((r) => [r.start, r]))
  const readNum = (i: number): { value: number; end: number } | null => {
    let neg = false
    let k = i
    if (tokIs(toks[k], 'âm') && runAt.has(k + 1)) {
      neg = true
      k++
    }
    const r = runAt.get(k)
    return r ? { value: neg ? -r.value : r.value, end: r.end } : null
  }
  for (let i = 0; i < toks.length; i++) {
    const first = readNum(i)
    if (!first) continue
    const expr: MathToken[] = [first.value]
    let pos = first.end
    for (;;) {
      const op = opAt(toks, pos)
      if (!op) break
      const n = readNum(pos + op.len)
      if (!n) break
      expr.push(op.op, n.value)
      pos = n.end
    }
    if (expr.length < 3) continue
    let end = pos
    for (const tr of TRAILERS) {
      if (tr.every((wd, k) => tokIs(toks[end + k], wd))) {
        end += tr.length
        break
      }
    }
    return { start: i, end, action: evalMath(expr) }
  }
  return null
}

export function evalMath(expr: MathToken[]): ActionOf<'math'> {
  const nums: number[] = [expr[0] as number]
  const ops: MathOp[] = []
  let div0 = false
  for (let k = 1; k < expr.length; k += 2) {
    const op = expr[k] as MathOp
    const v = expr[k + 1] as number
    if (op === '*' || op === '/') {
      const a = nums.pop()!
      if (op === '/' && v === 0) div0 = true
      nums.push(op === '*' ? a * v : v === 0 ? 0 : a / v)
    } else {
      nums.push(v)
      ops.push(op)
    }
  }
  let result = nums[0]!
  for (let k = 0; k < ops.length; k++) result = ops[k] === '+' ? result + nums[k + 1]! : result - nums[k + 1]!
  if (div0) return { type: 'math', expr, result: null, error: 'div0' }
  if (!Number.isFinite(result) || Math.abs(result) > 1e12)
    return { type: 'math', expr, result: null, error: 'overflow' }
  const rounded = Math.round(result * 1e4) / 1e4
  return { type: 'math', expr, result: Object.is(rounded, -0) ? 0 : rounded }
}

// ------------------------------------------------------------------------------------ places

export function toPlaceRef(p: PlaceEntry): PlaceRef {
  return { id: p.id, name: { vi: p.vi, en: p.en }, lat: p.lat, lon: p.lon }
}

// ------------------------------------------------------------------------- whitelisted objects

const compiledObjects = OBJECTS.flatMap((o) =>
  o.phrases.map((p) => ({ words: p.split(' ').map((x) => strip(canonSyl(x))), name: o.name })),
).sort((a, b) => b.words.length - a.words.length)
const CLASSIFIER_STRIPS = new Set(CLASSIFIERS.map((c) => strip(c)))

/**
 * The first whitelisted object in toks[from, to) ("một quả chuối" → chuối / a banana).
 * Returns the name only — never the user's own words.
 */
export function findObject(toks: readonly Tok[], from: number, to: number): Bilingual | undefined {
  for (let i = from; i < to; i++) {
    for (const o of compiledObjects) {
      if (i + o.words.length > to) continue
      if (o.words.every((wd, k) => toks[i + k]!.strip === wd)) {
        // "cam" as an object only after a classifier or right after the verb
        return o.name
      }
    }
    // skip numbers and classifiers before the noun; stop at anything else that is long enough to matter
    if (CLASSIFIER_STRIPS.has(toks[i]!.strip)) continue
  }
  return undefined
}

// ------------------------------------------------------------------------------ timer labels

const compiledLabels = TIMER_LABELS.map((l) => ({
  words: l.split(' ').map((x) => strip(canonSyl(x))),
  label: l,
})).sort((a, b) => b.words.length - a.words.length)

/** A whitelisted reminder label found in toks[from, to), e.g. "uống thuốc". */
export function findTimerLabel(toks: readonly Tok[], from: number, to: number): string | undefined {
  return findTimerLabelAt(toks, from, to)?.label
}

/** The first whitelisted reminder label in toks[from, to), with its token range. */
export function findTimerLabelAt(
  toks: readonly Tok[],
  from: number,
  to: number,
): { label: string; start: number; end: number } | undefined {
  for (let i = from; i < to; i++) {
    for (const l of compiledLabels) {
      if (i + l.words.length > to) continue
      if (l.words.every((wd, k) => toks[i + k]!.strip === wd))
        return { label: l.label, start: i, end: i + l.words.length }
    }
  }
  return undefined
}

/** Does a whitelisted label end exactly at token j ("đón cháu": "cháu" is not an addressee here)? */
export function timerLabelEndsAt(toks: readonly Tok[], j: number): boolean {
  return compiledLabels.some(
    (l) =>
      l.words.length > 1 &&
      j - l.words.length + 1 >= 0 &&
      l.words.every((wd, k) => toks[j - l.words.length + 1 + k]!.strip === wd),
  )
}
