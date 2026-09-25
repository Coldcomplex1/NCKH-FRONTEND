import type { DialectRegion } from '@/core/parser'
import { DIALECT, SPELLING, type RewriteEntry } from './lexicon/dialect'
import { TRAILING_PARTICLES } from './lexicon/fillers'
import { canonSyl, COMMA_MARK, phoKey, preRewrite, Q_MARK, rawPieces, SEP_MARK, strip } from './text'
import type { PendingSub, Sentence, Tok } from './types'

const OP_WORDS: Record<string, Tok['op']> = { '+': '+', '-': '-', '*': '*', '/': '/', '=': '=' }

export function makeTok(word: string, cap = false, initial = false): Tok {
  const raw = word.toLowerCase().normalize('NFC')
  const text = canonSyl(raw)
  const s = strip(text)
  const tok: Tok = { text, raw, strip: s, pho: phoKey(s), ascii: s === text, cap, initial }
  const op = OP_WORDS[text]
  if (op) tok.op = op
  return tok
}

/** Tokens → sentences, split on separators; "?" marks the sentence it ends as a question. */
export function tokenize(input: string): Sentence[] {
  const pieces = rawPieces(preRewrite(input))
  const sentences: Sentence[] = []
  let cur: Tok[] = []
  let comma = false
  let nextComma = false
  const flush = (question: boolean): void => {
    // ALL-CAPS or Title Case input (ASR, shouting) carries no proper-name information
    const words = cur.filter((t) => /\p{L}/u.test(t.text))
    if (words.length >= 2 && words.filter((t) => t.cap).length >= Math.max(2, words.length * 0.8)) {
      for (const t of cur) t.cap = false
    }
    if (cur.length > 0 || question) {
      if (cur.length > 0)
        sentences.push(comma ? { toks: cur, question, afterComma: true } : { toks: cur, question })
      else if (question && sentences.length > 0) sentences[sentences.length - 1]!.question = true
    }
    if (cur.length > 0 || !nextComma) comma = nextComma
    cur = []
  }
  for (const p of pieces) {
    nextComma = p === COMMA_MARK
    if (p === SEP_MARK || p === COMMA_MARK) flush(false)
    else if (p === Q_MARK) flush(true)
    else {
      cur.push(makeTok(p, /^\p{Lu}/u.test(p), cur.length === 0))
    }
  }
  flush(false)
  return sentences
}

interface CompiledRewrite {
  entry: RewriteEntry
  from: Tok[]
  to: string[]
  altTo?: string[]
}

const PARTICLE_SET = new Set<string>(TRAILING_PARTICLES)
/** No-diacritics spellings of particles that cannot be anything else at the end ("rua", "nhe"). */
const ASCII_PARTICLES = new Set([
  'rua',
  'nhe',
  'nha',
  'nhen',
  'nghen',
  'ne',
  'hen',
  'ha',
  'vay',
  'coi',
  'xem',
  'oi',
])
const canonList = (xs: readonly string[] | undefined): Set<string> | undefined =>
  xs ? new Set(xs.map((x) => (x === '' ? '' : canonSyl(x)))) : undefined

interface CompiledConds {
  skipIfPrev?: Set<string>
  skipIfNext?: Set<string>
  onlyIfPrev?: Set<string>
  onlyIfNext?: Set<string>
  altPrev?: Set<string>
}

function compile(entries: readonly RewriteEntry[]): (CompiledRewrite & CompiledConds)[] {
  return entries
    .map((entry) => {
      const from = entry.from.split(' ').map((w) => makeTok(w))
      const c: CompiledRewrite & CompiledConds = {
        entry,
        from,
        to: entry.to.split(' ').filter(Boolean),
        skipIfPrev: canonList(entry.skipIfPrev),
        skipIfNext: canonList(entry.skipIfNext),
        onlyIfPrev: canonList(entry.onlyIfPrev),
        onlyIfNext: canonList(entry.onlyIfNext),
        altPrev: canonList(entry.altAfterPrev?.prev),
      }
      if (entry.altAfterPrev) c.altTo = entry.altAfterPrev.to.split(' ')
      return c
    })
    .sort((a, b) => b.from.length - a.from.length)
}

let compiledSpelling: ReturnType<typeof compile> | null = null
let compiledDialect: ReturnType<typeof compile> | null = null

/** Does the input token match a rewrite's source token? */
function tokMatches(input: Tok, src: Tok, rw: CompiledRewrite, accentedMode: boolean): boolean {
  if (input.text === src.text) {
    // ACC entries (no `ascii`) apply only when the user types with diacritics
    return rw.entry.ascii === true || accentedMode
  }
  // ASCII-safe entries also accept the diacritic-free spelling
  return rw.entry.ascii === true && input.ascii && input.strip === src.strip
}

const inSet = (set: Set<string> | undefined, t: Tok | undefined): boolean => {
  if (!set) return false
  if (!t) return set.has('')
  return set.has(t.text) || (t.ascii && [...set].some((x) => strip(x) === t.strip))
}

/** Is `next` absent, or only trailing particles until the end of the sentence? */
const isLast = (toks: readonly Tok[], k: number): boolean => {
  for (let i = k; i < toks.length; i++) {
    const t = toks[i]!
    if (!PARTICLE_SET.has(t.text) && !(t.ascii && ASCII_PARTICLES.has(t.strip))) return false
  }
  return true
}

function applyRewrites(
  toks: Tok[],
  table: ReturnType<typeof compile>,
  accentedMode: boolean,
  subs: PendingSub[],
): Tok[] {
  const out: Tok[] = []
  let i = 0
  outer: while (i < toks.length) {
    for (const rw of table) {
      const n = rw.from.length
      if (i + n > toks.length) continue
      let ok = true
      for (let k = 0; k < n && ok; k++) ok = tokMatches(toks[i + k]!, rw.from[k]!, rw, accentedMode)
      if (!ok) continue
      const prev = out[out.length - 1]
      const next = toks[i + n]
      const e = rw.entry
      if (e.skipIfPrev && inSet(rw.skipIfPrev, prev)) continue
      if (e.skipIfNext && next && inSet(rw.skipIfNext, next)) continue
      if (e.onlyIfPrev && !inSet(rw.onlyIfPrev, prev)) continue
      if (e.onlyIfNext && !inSet(rw.onlyIfNext, next)) continue
      if (e.onlyLast && !isLast(toks, i + n)) continue
      if (e.notLast && isLast(toks, i + n)) continue
      const first = toks[i]!
      // a capitalized word inside a sentence is a proper name ("Ho Chi Minh", "Đặng"): never a dialect word
      if ((e.skipIfCapitalized || e.kind === 'dialect') && first.cap && !first.initial) continue
      const words = rw.altTo && inSet(rw.altPrev, prev) ? rw.altTo : rw.to
      const fromText = toks
        .slice(i, i + n)
        .map((t) => t.raw)
        .join(' ')
      const made = words.map((w, k) => {
        const t = makeTok(w, k === 0 && first.cap, k === 0 && first.initial)
        t.sub = subs.length
        return t
      })
      if (
        words.join(' ') !==
        toks
          .slice(i, i + n)
          .map((t) => t.text)
          .join(' ')
      ) {
        const sub: PendingSub = { from: fromText, to: words.join(' '), kind: e.kind, toks: made }
        if (e.region) sub.region = [...e.region] as DialectRegion[]
        subs.push(sub)
      } else {
        for (const t of made) delete t.sub
      }
      out.push(...made)
      i += n
      continue outer
    }
    out.push(toks[i]!)
    i++
  }
  return out
}

/** Spelling / chat fixes, then dialect rewrites, per sentence (spec §2 N8, N10). */
export function rewriteSentences(
  sentences: Sentence[],
  accentedMode: boolean,
): { sentences: Sentence[]; subs: PendingSub[] } {
  compiledSpelling ??= compile(SPELLING)
  compiledDialect ??= compile(DIALECT)
  const subs: PendingSub[] = []
  const outS = sentences.map((s) => {
    const a = applyRewrites(s.toks, compiledSpelling!, accentedMode, subs)
    const b = applyRewrites(a, compiledDialect!, accentedMode, subs)
    return s.afterComma
      ? { toks: b, question: s.question, afterComma: true }
      : { toks: b, question: s.question }
  })
  return { sentences: outS, subs }
}

/** The input is "accented" when any word carries a diacritic. */
export function detectMode(sentences: readonly Sentence[]): 'accented' | 'ascii' {
  return sentences.some((s) => s.toks.some((t) => /\p{L}/u.test(t.text) && !t.ascii)) ? 'accented' : 'ascii'
}
