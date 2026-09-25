import { actionCategory, LIMITS, type Action } from '@/core/actions'
import {
  deriveStatus,
  macroRegion,
  type CommandParser,
  type DialectRegion,
  type Note,
  type ParseContext,
  type ParsedAction,
  type ParseOptions,
  type ParseResult,
  type ParseStatus,
  type Substitution,
  type Suggestion,
  type UnknownInfo,
} from '@/core/parser'
import { splitClauses } from './clauses'
import { dice } from './fuzzy'
import { DEFAULT_SUGGESTIONS, EXEMPLARS, SLOT_SUGGESTIONS } from './lexicon/exemplars'
import { CONDITIONAL_PARTICLES, FILLERS, QUESTION_PARTICLES, TRAILING_PARTICLES } from './lexicon/fillers'
import { detectMode, rewriteSentences, tokenize } from './normalize'
import { findNumberRuns } from './numbers'
import { CARRY_MODS, HEADS, has, resolveClause, type Carry, type Draft } from './resolve'
import { findMath, findTimerLabelAt, timerLabelEndsAt, type MathHit } from './slots'
import {
  allMatches,
  candidatesFor,
  getLexicon,
  phraseEndsAt,
  tile,
  type Concept,
  type Span,
  type TagInput,
} from './tagger'
import { canonSyl, strip, toneClass, toneOf } from './text'
import type { PendingSub, Sentence, Tok } from './types'

/**
 * The rule-based parser (spec §0): normalize → dialect/spelling rewrites → numbers → clause split →
 * trailing particles → phrase-lattice tagging → intent resolution → post-processing. Pure and
 * synchronous under the hood (≈1 ms per command); the async signature matches CommandParser.
 */

export const RULE_PARSER_ID = 'rule-v1'

/** Execute threshold (spec §7.3). Below it the actions are dropped: unknown + "did you mean" chips. */
const EXECUTE_AT = 0.55
/** Upper bound on actions kept per utterance; the engine applies LIMITS.maxActions and says so. */
const MAX_PARSED_ACTIONS = LIMITS.maxActions * 2

// ------------------------------------------------------------------------------ particle sets

const canonSet = (xs: readonly string[]): Set<string> => new Set(xs.map((x) => canonSyl(x)))
const PARTICLES = canonSet(TRAILING_PARTICLES)
const CONDITIONAL = canonSet(CONDITIONAL_PARTICLES)
const QUESTION = canonSet(QUESTION_PARTICLES)
/** Vocatives are handled by the "<name> ơi" phrases; stripping "ơi" would leave "trời" = weather. */
const NEVER_STRIP = canonSet(['ơi'])
/** No-diacritics spellings that are more likely a content word here (đỏ, hồng, mấy, dậy). */
const NOT_PARTICLE_IN_ASCII = canonSet(['đó', 'đấy', 'hông', 'mày'])
const NEGATORS = canonSet(['không', 'đừng', 'chẳng', 'chả', 'chớ', 'khỏi', 'cấm', 'hổng', 'nỏ'])
/** Single-word fillers: never count as a "content" match when scoring suggestions. */
const FILLER_WORDS = canonSet(FILLERS.filter((f) => !/[\s|[]/.test(f)))

const ASCII_PARTICLE = new Map<string, string>()
for (const p of [...PARTICLES, ...CONDITIONAL]) {
  if (NOT_PARTICLE_IN_ASCII.has(p)) continue
  if (!ASCII_PARTICLE.has(strip(p))) ASCII_PARTICLE.set(strip(p), p)
}

/**
 * The canonical particle a token stands for, if any. Diacritic-free spellings count only in
 * no-diacritics input ("Ho Chi Minh" has no "hộ", "chị", "mình"), and a capitalized word inside a
 * sentence is a name, not a particle.
 */
function particleOf(t: Tok, mode: 'accented' | 'ascii'): string | undefined {
  if (t.cap && !t.initial) return undefined
  if (PARTICLES.has(t.text) || CONDITIONAL.has(t.text)) return t.text
  if (t.ascii && mode === 'ascii') return ASCII_PARTICLE.get(t.strip)
  return undefined
}

/** Display spellings of spoken math words typed without diacritics. */
const ASCII_MATH_WORDS: Record<string, string> = {
  cong: 'cộng',
  tru: 'trừ',
  nhan: 'nhân',
  bang: 'bằng',
  may: 'mấy',
  bao: 'bao',
  nhieu: 'nhiêu',
  them: 'thêm',
  bot: 'bớt',
  duoc: 'được',
  la: 'là',
}

// ------------------------------------------------------------------------------------ tagging

interface Tagged {
  /** Tokens before the trailing-particle pass (used when merging soft clauses back). */
  raw: Tok[]
  toks: Tok[]
  question: boolean
  hadNua: boolean
  soft: boolean
  sep: Tok[]
  inp: TagInput
  spans: Span[]
  math: MathHit | null
  /** Stripped particle tokens → their canonical spelling (for no-diacritics display). */
  stripped: Map<Tok, string>
}

function tagInput(toks: readonly Tok[], mode: 'accented' | 'ascii', blockedFrom?: MathHit | null): TagInput {
  const lex = getLexicon()
  const runs = findNumberRuns(
    toks.map((t) => ({ text: t.text, strip: t.strip, ascii: t.ascii, isOp: !!t.op })),
    undefined,
    mode,
  )
  const cands = toks.map((_, k) => candidatesFor(toks, k, mode, lex))
  const blocked = toks.map((_, k) => !!blockedFrom && k >= blockedFrom.start && k < blockedFrom.end)
  return { toks, cands, runs, blocked, mode }
}

/** Spec §2 N12: strip trailing particles from the right while the guards hold. */
function stripTrailing(
  raw: readonly Tok[],
  mode: 'accented' | 'ascii',
): { toks: Tok[]; question: boolean; hadNua: boolean; stripped: Map<Tok, string> } {
  const inp = tagInput(raw, mode)
  const inRun = (k: number): boolean => inp.runs.some((r) => k >= r.start && k < r.end)
  const stripped = new Map<Tok, string>()
  let end = raw.length
  let question = false
  let hadNua = false
  while (end >= 2) {
    const j = end - 1
    const t = raw[j]!
    const p = particleOf(t, mode)
    if (!p || NEVER_STRIP.has(p) || inRun(j)) break
    if (phraseEndsAt(inp, j) || timerLabelEndsAt(raw, j)) break
    if (CONDITIONAL.has(p) && !PARTICLES.has(p)) {
      if (p === 'cái' && inRun(j - 1)) break
      if (p === 'đâu' && !raw.slice(0, j).some((x) => NEGATORS.has(x.text))) break
    }
    if (QUESTION.has(p)) question = true
    if (p === 'nữa') hadNua = true
    stripped.set(t, p)
    end = j
  }
  return { toks: raw.slice(0, end), question, hadNua, stripped }
}

function tagClause(
  raw: Tok[],
  question: boolean,
  soft: boolean,
  sep: Tok[],
  mode: 'accented' | 'ascii',
): Tagged {
  const st = stripTrailing(raw, mode)
  const toks = st.toks
  const first = tagInput(toks, mode)
  const math = findMath(toks, first.runs)
  const inp = math ? tagInput(toks, mode, math) : first
  const spans = tile(inp, allMatches(inp))
  return {
    raw,
    toks,
    question: question || st.question,
    hadNua: st.hadNua,
    soft,
    sep,
    inp,
    spans,
    math,
    stripped: st.stripped,
  }
}

const NON_CONTENT: ReadonlySet<Concept> = new Set<Concept>(['FILLER', 'SFILLER', 'CLASSIFIER', 'QMARK'])

/** Calling the robot itself ("Ronaldo ơi", "bạn ơi") — not "trời ơi" or "mẹ ơi". */
const VOCATIVE = /^(bạn|robot|ronaldo|người máy|em|bé|cưng|con|cháu)( ơi)?$/u

const REFUSAL: ReadonlySet<Concept> = new Set<Concept>(['UNSUP', 'UNSAFE', 'DEVICE'])

const actsIn = (c: Tagged): boolean =>
  !!c.math || c.spans.some((s) => HEADS.has(s.m.e.concept) || s.alts.some((a) => HEADS.has(a.e.concept)))

/** The right side of "và" holds only a device, direction or colour ("bật đèn và quạt"). */
const onlyCarryMods = (c: Tagged): boolean => {
  const real = c.spans.filter((s) => !NON_CONTENT.has(s.m.e.concept))
  return real.length > 0 && real.every((s) => [...CARRY_MODS].some((m) => has(s, m)))
}

/** The clause is only a whitelisted reminder label ("uống thuốc"), plus fillers. */
const labelOnly = (c: Tagged): boolean => {
  const at = findTimerLabelAt(c.toks, 0, c.toks.length)
  if (!at) return false
  return c.spans.every((s) => (s.start >= at.start && s.end <= at.end) || NON_CONTENT.has(s.m.e.concept))
}
/** "bà ở Quảng Nam, hôm nay trời sao": a piece that only names a place. */
const placeOnly = (c: Tagged): boolean =>
  c.spans.some((s) => s.m.e.concept === 'PLACE') &&
  c.spans.every((s) => s.m.e.concept === 'PLACE' || NON_CONTENT.has(s.m.e.concept))
const hasTrigger = (c: Tagged): boolean =>
  c.spans.some((s) => ['TIMER', 'REMIND', 'WAKE_ME'].includes(s.m.e.concept))

/** Tag every clause, merging soft-separated pieces back unless both sides act (spec §6). */
function tagAll(sentences: Sentence[], mode: 'accented' | 'ascii'): Tagged[] {
  const out: Tagged[] = []
  for (const c of splitClauses(sentences)) {
    const t = tagClause(c.toks, c.question, c.soft, c.sep, mode)
    const prev = out[out.length - 1]
    if (t.soft && prev) {
      // after a comma the piece stays apart only when it acts on its own ("hẹn giờ, 5 phút" is one
      // command); a bare reminder label before a reminder belongs to it ("uống thuốc, nhắc tôi …")
      const keep = c.comma
        ? actsIn(t) && !(labelOnly(prev) && hasTrigger(t)) && !(placeOnly(prev) && !actsIn(prev))
        : actsIn(prev) && (actsIn(t) || onlyCarryMods(t))
      if (!keep) {
        out[out.length - 1] = tagClause(
          [...prev.raw, ...t.sep, ...t.raw],
          prev.question || t.question,
          prev.soft,
          prev.sep,
          mode,
        )
        continue
      }
    }
    out.push(t)
  }
  return out
}

// --------------------------------------------------------------------------------- confidence

interface Scored extends Draft {
  clause: number
  confidence: number
}

/** Fraction of the clause's content tokens that the chosen actions explain (spec §7.3). */
function coverage(c: Tagged, consumed: ReadonlySet<Span>): number {
  let covered = 0
  let total = 0
  const spanAt = new Map<number, Span>()
  for (const s of c.spans) for (let k = s.start; k < s.end; k++) spanAt.set(k, s)
  for (let k = 0; k < c.toks.length; k++) {
    if (c.math && k >= c.math.start && k < c.math.end) {
      covered++
      total++
      continue
    }
    const s = spanAt.get(k)
    if (s && consumed.has(s)) {
      covered++
      total++
    } else if (s) {
      if (NON_CONTENT.has(s.m.e.concept) || s.m.e.concept === 'NEG') continue
      total += 0.5 // tagged, but not used by any action
    } else {
      const t = c.toks[k]!
      if (particleOf(t, c.inp.mode) || /^\d/.test(t.text) || t.op) continue
      total += 1
    }
  }
  return total === 0 ? 1 : covered / total
}

function quality(d: Draft): number {
  if (d.mathRange || d.spans.length === 0) return 1
  let sum = 0
  let n = 0
  for (const s of d.spans) {
    const len = s.end - s.start
    sum += s.m.mean * len
    n += len
  }
  return n ? Math.min(1, sum / n) : 1
}

const round2 = (x: number): number => Math.round(x * 100) / 100

// -------------------------------------------------------------------------------- suggestions

const intentOf = (t: Action['type']): string => (t.startsWith('timer') ? 'timer' : t)

function pushUnique(out: Suggestion[], xs: readonly Suggestion[]): void {
  for (const x of xs) if (!out.some((o) => o.say === x.say)) out.push({ say: x.say, label: { ...x.label } })
}

/** "Did you mean" chips for text that matched nothing (spec §5 Suggestions). */
function exemplarsFor(text: string): Suggestion[] {
  const s = strip(text)
  const words = new Set(
    text
      .split(' ')
      .filter((w) => w && !FILLER_WORDS.has(w))
      .map((w) => strip(w)),
  )
  // only fillers ("dạ", "vâng", "ừ"): nothing to look alike, the default chips are better
  if (words.size === 0) return []
  const scored = EXEMPLARS.map((e) => {
    const es = strip(e.say)
    const content = e.say.split(' ').filter((w) => !FILLER_WORDS.has(canonSyl(w)))
    const bonus = content.some((w) => words.has(strip(w))) ? 0.15 : 0
    return { e, score: dice(s, es) + bonus }
  }).sort((a, b) => b.score - a.score)
  const out: Suggestion[] = []
  const seen = new Set<string>()
  for (const { e, score } of scored) {
    if (score < 0.25 || out.length >= 3) break
    if (seen.has(e.intent)) continue
    seen.add(e.intent)
    out.push({ say: e.say, label: { ...e.label } })
  }
  return out
}

// ------------------------------------------------------------------------- text + offsets

function dialectHints(subs: readonly PendingSub[]): Partial<Record<DialectRegion, number>> {
  const dia = subs.filter((s) => s.kind === 'dialect' && s.region && s.region.length > 0)
  const hints: Partial<Record<DialectRegion, number>> = {}
  if (dia.length === 0) return hints
  // attribute every word to the region(s) all the words share, else to its primary region
  let common = new Set<DialectRegion>(dia[0]!.region)
  for (const s of dia.slice(1)) common = new Set(s.region!.filter((r) => common.has(r)))
  for (const s of dia) {
    const shared = s.region!.filter((x) => common.has(x))
    // a word used both in the Centre and the South ("tui", "coi") with nothing else to tell them
    // apart counts for both macro regions; otherwise for the first region the words share
    const macros = new Set(shared.map((x) => macroRegion(x)))
    const pick = macros.size > 1 ? [...new Map(shared.map((x) => [macroRegion(x), x])).values()] : []
    for (const r of pick.length > 0 ? pick : [shared[0] ?? s.region![0]!]) hints[r] = (hints[r] ?? 0) + 1
  }
  return hints
}

const sameAction = (a: Action, b: Action): boolean => JSON.stringify(a) === JSON.stringify(b)

const ONSET_RE = /^(ngh|ng|gh|gi(?=[aeiouy])|qu|ch|kh|nh|ph|th|tr|[bcdghklmnpqrstvwxz])?/
const FINAL_RE = /(ng|nh|ch|[cmnpt])$/
const SOUTH_ONSETS = new Set(['v', 'd', 'gi', 'r', 'g', 'z', 'w', 'qu'])

/**
 * The regions whose speech merges what separates the typed word from the lexicon word, or null
 * when it is no sound merger (e.g. a left-out accent mark). Tones hỏi/ngã/nặng and finals
 * n/ng, t/c merge in the Centre and South; v/d/gi/r, g/r, qu/w onsets in the South.
 */
function mergeRegions(from: string, to: string): DialectRegion[] | null {
  const a = strip(from)
  const b = strip(to)
  const regions = new Set<DialectRegion>()
  const ta = toneOf(from)
  const tb = toneOf(to)
  if (ta !== tb && toneClass(ta) === toneClass(tb) && toneClass(ta) === 'x') {
    regions.add('central')
    regions.add('southern')
  }
  const oa = ONSET_RE.exec(a)?.[0] ?? ''
  const ob = ONSET_RE.exec(b)?.[0] ?? ''
  if (oa !== ob && SOUTH_ONSETS.has(oa) && SOUTH_ONSETS.has(ob)) regions.add('southern')
  const fa = FINAL_RE.exec(a)?.[0] ?? ''
  const fb = FINAL_RE.exec(b)?.[0] ?? ''
  if (fa !== fb) {
    regions.add('central')
    regions.add('southern')
  }
  if (regions.size === 0 && oa === ob && fa === fb && ta === tb) return null
  return [...regions]
}

// ------------------------------------------------------------------------------------- parse

function emptyResult(input: string, notes: Note[], t0: number): ParseResult {
  const unknown: UnknownInfo[] = [{ text: '', clause: 0, reason: 'empty' }]
  return {
    parser: RULE_PARSER_ID,
    input,
    normalizedText: '',
    coreText: '',
    inputMode: 'accented',
    substitutions: [],
    dialectHints: {},
    clauses: [],
    actions: [],
    unknown,
    suggestions: DEFAULT_SUGGESTIONS.map((s) => ({ say: s.say, label: { ...s.label } })),
    confidence: 0,
    notes,
    status: deriveStatus([], unknown),
    elapsedMs: now() - t0,
  }
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** Parse one command synchronously. Exported for tests and for the n-best reranker. */
export function parseSync(text: string, ctx: ParseContext): ParseResult {
  const t0 = now()
  const notes: Note[] = []
  let input = text.trim()
  if (input.length > LIMITS.maxInputChars) {
    input = input.slice(0, LIMITS.maxInputChars)
    notes.push({ kind: 'truncated', data: { max: LIMITS.maxInputChars } })
  }
  const base = tokenize(input)
  if (base.length === 0) return emptyResult(text, notes, t0)
  const mode = detectMode(base)
  const { sentences, subs } = rewriteSentences(base, mode === 'accented')
  const tagged = tagAll(sentences, mode)

  // ---- resolve clause by clause, carrying device / verb / motion forward
  const carry: Carry = {}
  const scored: Scored[] = []
  const unknown: UnknownInfo[] = []
  const suggestions: Suggestion[] = []
  const lowConfIntents: string[] = []
  const consumedAll: { c: Tagged; consumed: ReadonlySet<Span> }[] = []
  const clauseInfo: ParseResult['clauses'] = []

  tagged.forEach((c, index) => {
    const out = resolveClause(
      { index, toks: c.toks, spans: c.spans, math: c.math, question: c.question, hadNua: c.hadNua },
      ctx,
      carry,
    )
    for (const n of out.notes) if (!notes.some((x) => x.kind === n.kind)) notes.push(n)
    pushUnique(suggestions, out.suggestions)
    consumedAll.push({ c, consumed: out.consumed })
    const cov = coverage(c, out.consumed)
    const kept: Scored[] = []
    for (const d of out.drafts) {
      const confidence = round2(Math.min(1, (0.6 * quality(d) + 0.4 * cov) * d.confMul))
      if (confidence < EXECUTE_AT) lowConfIntents.push(intentOf(d.action.type))
      else kept.push({ ...d, clause: index, confidence })
    }
    const clauseText = c.raw.map((t) => t.text).join(' ')
    const hasContent = coverageTotal(c) > 0
    if (kept.length === 0) {
      if (out.drafts.length > 0 || out.missing)
        unknown.push({ text: clauseText, clause: index, reason: 'low_confidence' })
      else if (hasContent && !out.notes.some((n) => n.kind === 'nothing_to_repeat'))
        unknown.push({ text: clauseText, clause: index, reason: 'no_match' })
    }
    scored.push(...kept)
    clauseInfo.push({ text: clauseText, negated: kept.some((d) => d.negated === true), question: c.question })
    // carry-over for the next clause (spec §6)
    carry.timer = kept.some((d) => d.action.type === 'timer_start')
    for (const d of kept) {
      const a = d.action
      if (a.type === 'light' || a.type === 'fan') {
        carry.device = a.type
        if (a.power) carry.verb = a.power
        else if (a.type === 'light' && a.color) carry.verb = 'on'
      } else if (a.type === 'turn' || a.type === 'walk') carry.motion = a.type
    }
  })

  // ---- only fillers: a bare vocative ("Ronaldo ơi", "bạn ơi") is a hello; anything else is unknown
  if (scored.length === 0 && unknown.length === 0 && !notes.some((n) => n.kind === 'nothing_to_repeat')) {
    const vocative = tagged
      .flatMap((c) => c.spans)
      .find((s) => s.m.e.concept === 'SFILLER' && VOCATIVE.test(s.m.e.text))
    if (vocative) {
      const clause = tagged.findIndex((c) => c.spans.includes(vocative))
      scored.push({
        action: { type: 'greet' },
        pos: vocative.start,
        spans: [vocative],
        source: 'implicit',
        confMul: 0.85,
        clause,
        confidence: 0.85,
      })
    } else unknown.push({ text: input, clause: 0, reason: 'no_match' })
  }

  // ---- post-process: de-duplicate consecutive identical non-motion actions ("nóng quá, bật quạt đi")
  const final: Scored[] = []
  for (const d of scored) {
    const prev = final[final.length - 1]
    if (prev && sameAction(prev.action, d.action) && actionCategory(d.action.type) !== 'motion') {
      if (d.confidence > prev.confidence) final[final.length - 1] = d
      continue
    }
    final.push(d)
  }
  const kept = final.slice(0, MAX_PARSED_ACTIONS)

  // ---- suggestions: slot chips first, then the intents we almost understood, then look-alikes
  if (unknown.length > 0) {
    for (const intent of lowConfIntents)
      pushUnique(suggestions, EXEMPLARS.filter((e) => e.intent === intent).slice(0, 1))
    for (const u of unknown) if (u.reason === 'no_match') pushUnique(suggestions, exemplarsFor(u.text))
    if (suggestions.length === 0) pushUnique(suggestions, DEFAULT_SUGGESTIONS)
  }
  if (kept.some((d) => d.action.type === 'smalltalk' && d.action.topic === 'user_sad'))
    pushUnique(suggestions, SLOT_SUGGESTIONS.user_sad)
  const suggestionCap = suggestions.length > 3 && unknown.length > 0 && kept.length === 0 ? 4 : 3

  // ---- display text: corrections applied, character offsets for every substitution
  const corrected = new Map<Tok, string>()
  const fuzzySubs: { tok: Tok; to: string; kind: Substitution['kind']; region?: DialectRegion[] }[] = []
  const refusals = new Set<Span>(kept.filter((d) => d.action.type === 'unsupported').flatMap((d) => d.spans))
  for (const { c, consumed } of consumedAll) {
    if (mode === 'ascii') {
      for (const [tok, p] of c.stripped) if (tok.sub === undefined) corrected.set(tok, p)
      if (c.math) {
        for (let k = c.math.start; k < c.math.end; k++) {
          const tok = c.toks[k]
          const w = tok ? ASCII_MATH_WORDS[tok.strip] : undefined
          if (tok && w) corrected.set(tok, w)
        }
      }
      for (const r of c.inp.runs) {
        for (let k = r.start; k < r.end; k++) {
          const tok = c.toks[k]
          const w = r.words[k - r.start]
          if (tok && w && tok.ascii && w !== tok.text) corrected.set(tok, w)
        }
      }
    }
    for (const s of c.spans) {
      // the reading the action used: a refusal took the UNSUP alternative ("mua chuoi" = mua, not múa)
      const used =
        (refusals.has(s) && !REFUSAL.has(s.m.e.concept) && s.alts.find((a) => REFUSAL.has(a.e.concept))) ||
        s.m
      for (const h of used.hits) {
        const tok = c.toks[h.pos]!
        if (tok.sub !== undefined || h.w === tok.text) continue
        if (h.tier === 'strip' && tok.ascii) {
          // restore diacritics in no-diacritics input; mixed input keeps the word as typed
          if (mode === 'ascii') corrected.set(tok, h.w)
          continue
        }
        if (!consumed.has(s)) continue
        const merge = h.tier === 'phonetic' || h.tier === 'tone' ? mergeRegions(tok.text, h.w) : null
        const kind: Substitution['kind'] = merge
          ? 'phonetic'
          : h.tier.startsWith('edit')
            ? 'fuzzy'
            : 'spelling'
        corrected.set(tok, h.w)
        fuzzySubs.push(
          merge && merge.length > 0 ? { tok, to: h.w, kind, region: merge } : { tok, to: h.w, kind },
        )
      }
    }
  }
  const offsets = new Map<Tok, number>()
  let normalizedText = ''
  for (const s of sentences) {
    for (const t of s.toks) {
      if (normalizedText) normalizedText += ' '
      offsets.set(t, normalizedText.length)
      normalizedText += corrected.get(t) ?? t.text
    }
  }
  const endOf = (t: Tok): number => (offsets.get(t) ?? 0) + (corrected.get(t) ?? t.text).length
  const substitutions: Substitution[] = []
  for (const p of subs) {
    const first = p.toks[0]
    const last = p.toks[p.toks.length - 1]
    if (!first || !last || !offsets.has(first)) continue
    const sub: Substitution = {
      from: p.from,
      to: p.to,
      start: offsets.get(first)!,
      end: endOf(last),
      kind: p.kind,
    }
    if (p.region) sub.region = [...p.region]
    substitutions.push(sub)
  }
  for (const f of fuzzySubs) {
    if (!offsets.has(f.tok)) continue
    const fs: Substitution = {
      from: f.tok.raw,
      to: f.to,
      start: offsets.get(f.tok)!,
      end: endOf(f.tok),
      kind: f.kind,
    }
    if (f.region) fs.region = f.region
    substitutions.push(fs)
  }
  substitutions.sort((a, b) => a.start - b.start)

  // "what I understood": the words the actions used
  const coreText = consumedAll
    .map(({ c, consumed }) =>
      c.toks
        .filter((_, k) => {
          if (c.math && k >= c.math.start && k < c.math.end) return true
          return c.spans.some((s) => consumed.has(s) && k >= s.start && k < s.end)
        })
        .map((t) => corrected.get(t) ?? t.text)
        .join(' '),
    )
    .filter(Boolean)
    .join(', ')

  const actions: ParsedAction[] = kept.map((d) => {
    const c = tagged[d.clause]!
    const pa: ParsedAction = {
      action: d.action,
      confidence: d.confidence,
      matched: matchedText(c, d, corrected),
      clause: d.clause,
      source: d.source,
    }
    if (d.negated) pa.negated = true
    return pa
  })

  return {
    parser: RULE_PARSER_ID,
    input: text,
    normalizedText,
    coreText,
    inputMode: mode,
    substitutions,
    dialectHints: dialectHints(subs),
    clauses: clauseInfo,
    actions,
    unknown,
    suggestions: suggestions.slice(0, suggestionCap),
    confidence: actions.length ? Math.min(...actions.map((a) => a.confidence)) : 0,
    notes,
    status: deriveStatus(actions, unknown),
    elapsedMs: round2(now() - t0),
  }
}

/** Content weight of a clause (0 = only fillers, particles and vocatives: skip it silently). */
function coverageTotal(c: Tagged): number {
  let total = 0
  const covered = new Set<number>()
  for (const s of c.spans) {
    if (NON_CONTENT.has(s.m.e.concept)) {
      for (let k = s.start; k < s.end; k++) covered.add(k)
    }
  }
  c.toks.forEach((t, k) => {
    if (covered.has(k) || particleOf(t, c.inp.mode)) return
    total++
  })
  return total
}

function matchedText(c: Tagged, d: Draft, corrected: ReadonlyMap<Tok, string>): string {
  const idx = new Set<number>()
  if (d.mathRange) for (let k = d.mathRange[0]; k < d.mathRange[1]; k++) idx.add(k)
  for (const s of d.spans) for (let k = s.start; k < s.end; k++) idx.add(k)
  return [...idx]
    .sort((a, b) => a - b)
    .map((k) => c.toks[k])
    .filter((t): t is Tok => !!t)
    .map((t) => corrected.get(t) ?? t.text)
    .join(' ')
}

const STATUS_RANK: Record<ParseStatus, number> = { ok: 3, partial: 2, impossible: 1, unknown: 0 }

/** Keep the most useful reading among ASR n-best hypotheses (intent-aware reranking, spec §11). */
function better(a: ParseResult, b: ParseResult): boolean {
  if (STATUS_RANK[a.status] !== STATUS_RANK[b.status]) return STATUS_RANK[a.status] > STATUS_RANK[b.status]
  return a.confidence > b.confidence + 1e-9
}

export class RuleParser implements CommandParser {
  readonly id = RULE_PARSER_ID

  parse(text: string, ctx: ParseContext, opts: ParseOptions = {}): Promise<ParseResult> {
    if (opts.signal?.aborted) return Promise.reject(new DOMException('Parse aborted', 'AbortError'))
    try {
      let best = parseSync(text, ctx)
      for (const alt of opts.alternatives ?? []) {
        if (!alt || alt === text) continue
        const r = parseSync(alt, ctx)
        if (better(r, best)) best = r
      }
      return Promise.resolve(best)
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)))
    }
  }
}
