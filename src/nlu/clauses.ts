import { LIGHT_WORDS } from './lexicon/fillers'
import { canonSyl, strip } from './text'
import type { Sentence, Tok } from './types'

/**
 * Clause splitting (spec §6): hard separators always split, "rồi"/"xong" only when something
 * follows them; "trước khi X thì Y" runs Y first; "không phải X mà Y" keeps Y; soft separators
 * ("và", "với lại") split tentatively and are confirmed by the parser once both sides are tagged.
 */
export interface Clause {
  toks: Tok[]
  question: boolean
  /** Joined to the previous clause by a soft separator ("và"): merge back unless both sides act. */
  soft: boolean
  /** The soft separator's own tokens (re-inserted when the clause is merged back). */
  sep: Tok[]
  /** Soft because it follows a comma: merged back unless it holds an action of its own. */
  comma?: boolean
}

const w = (s: string): string[] => s.split(' ').map((x) => canonSyl(x))

const HARD: string[][] = [
  'rồi sau đó',
  'và sau đó',
  'sau đó',
  'sau đấy',
  'tiếp theo',
  'tiếp đó',
  'kế đó',
  'kế tiếp',
  'rồi thì',
  'xong rồi',
  'xong thì',
  'rồi',
  'xong',
]
  .map(w)
  .sort((a, b) => b.length - a.length)
/** These split only when a content word follows (a final "rồi" is perfective: "mấy giờ rồi"). */
const NEEDS_CONTENT_AFTER = new Set(
  ['rồi', 'xong', 'xong rồi', 'rồi thì', 'xong thì'].map((s) => w(s).join(' ')),
)
const SOFT: string[][] = ['với lại', 'đồng thời', 'cùng lúc', 'cùng với', 'và']
  .map(w)
  .sort((a, b) => b.length - a.length)
const LIGHT = new Set<string>(LIGHT_WORDS)

const eq = (t: Tok | undefined, word: string): boolean =>
  !!t && (t.text === word || (t.ascii && t.strip === strip(word)))

function matchSeq(toks: readonly Tok[], i: number, seq: readonly string[]): boolean {
  for (let k = 0; k < seq.length; k++) if (!eq(toks[i + k], seq[k]!)) return false
  return true
}

function hasContentAt(toks: readonly Tok[], k: number): boolean {
  for (let i = k; i < toks.length; i++) {
    const t = toks[i]!
    if (!LIGHT.has(t.text) && !(t.ascii && [...LIGHT].some((l) => strip(l) === t.strip))) return true
  }
  return false
}

/** Split one sentence at hard separators. */
function splitHard(toks: readonly Tok[]): Tok[][] {
  const out: Tok[][] = []
  let cur: Tok[] = []
  let i = 0
  while (i < toks.length) {
    let sep: string[] | null = null
    for (const seq of HARD) {
      if (!matchSeq(toks, i, seq)) continue
      if (NEEDS_CONTENT_AFTER.has(seq.join(' ')) && !hasContentAt(toks, i + seq.length)) continue
      sep = seq
      break
    }
    if (sep) {
      if (cur.length > 0) out.push(cur)
      cur = []
      i += sep.length
    } else {
      cur.push(toks[i]!)
      i++
    }
  }
  if (cur.length > 0) out.push(cur)
  return out
}

/** Split at soft separators, marking the right-hand pieces as `soft`. */
function splitSoft(toks: readonly Tok[]): { toks: Tok[]; soft: boolean; sep: Tok[] }[] {
  const out: { toks: Tok[]; soft: boolean; sep: Tok[] }[] = []
  let cur: Tok[] = []
  let soft = false
  let sep: Tok[] = []
  let i = 0
  while (i < toks.length) {
    const seq = i > 0 ? SOFT.find((s) => matchSeq(toks, i, s)) : undefined
    if (seq && i + seq.length < toks.length) {
      out.push({ toks: cur, soft, sep })
      cur = []
      soft = true
      sep = toks.slice(i, i + seq.length)
      i += seq.length
    } else {
      cur.push(toks[i]!)
      i++
    }
  }
  if (cur.length > 0) out.push({ toks: cur, soft, sep })
  return out.filter((c) => c.toks.length > 0)
}

export function splitClauses(sentences: readonly Sentence[]): Clause[] {
  const clauses: Clause[] = []
  /** A "trước khi X" piece waiting to be moved after the next clause. */
  let deferred: Clause[] = []
  for (const s of sentences) {
    let toks = [...s.toks]
    // "không phải X mà (là) Y" → Y
    if (matchSeq(toks, 0, w('không phải'))) {
      const k = toks.findIndex((t, idx) => idx > 1 && eq(t, 'mà'))
      if (k > 0) toks = toks.slice(eq(toks[k + 1], 'là') ? k + 2 : k + 1)
    }
    let before = false
    if (matchSeq(toks, 0, w('trước khi'))) {
      before = true
      toks = toks.slice(2)
    } else if (matchSeq(toks, 0, w('sau khi'))) {
      toks = toks.slice(2)
    }
    // "X thì Y" after a trước/sau khi marker splits into two pieces
    let pieces: Tok[][] = [toks]
    const thi = toks.findIndex((t, idx) => idx > 0 && eq(t, 'thì'))
    if (thi > 0 && (before || s.toks.length !== toks.length))
      pieces = [toks.slice(0, thi), toks.slice(thi + 1)]
    if (before && pieces.length === 2) pieces = [pieces[1]!, pieces[0]!]

    const produced: Clause[] = []
    for (const piece of pieces) {
      for (const hard of splitHard(piece)) {
        for (const soft of splitSoft(hard))
          produced.push({ toks: soft.toks, question: false, soft: soft.soft, sep: soft.sep })
      }
    }
    if (produced.length === 0) continue
    if (s.afterComma && !produced[0]!.soft) {
      produced[0]!.soft = true
      produced[0]!.comma = true
    }
    produced[produced.length - 1]!.question = s.question
    // pieces of a question sentence are questions too ("ngày mai có mưa không, nóng không?")
    if (s.question) for (const c of produced) c.question = true

    if (before && pieces.length === 1) {
      // "trước khi nhảy, vẫy tay" → the next sentence runs first
      deferred = produced
      continue
    }
    clauses.push(...produced)
    if (deferred.length > 0) {
      clauses.push(...deferred)
      deferred = []
    }
  }
  clauses.push(...deferred)
  return clauses
}
