import type { DayOffset } from '@/core/actions'
import { COLORS, type ColorValue } from './lexicon/colors'
import { CONCEPTS, type LexConcept, type PhraseDef } from './lexicon/concepts'
import {
  COMMON_ASCII_WORDS,
  COMMON_LEVEL_WORDS,
  FILLERS,
  STRONG_FILLERS,
  TRAILING_PARTICLES,
} from './lexicon/fillers'
import { CITIES, PROVINCES, type PlaceEntry } from './lexicon/places'
import { COUNTS, DAYS, DURATIONS, STEPS, type CountValue } from './lexicon/slots'
import {
  ABSENT_DEVICES,
  CLASSIFIERS,
  OBJECTS,
  TIMER_LABELS,
  UNSAFE,
  UNSUPPORTED,
  type DeviceEntry,
  type ObjectEntry,
  type UnsupportedEntry,
} from './lexicon/unsupported'
import { osa } from './fuzzy'
import { NUMBER_WORDS, type NumRun } from './numbers'
import { findObject } from './slots'
import { baseOf, canonSyl, nucleusOf, phoKey, strip, toneClass, toneOf } from './text'
import type { Tier, Tok } from './types'

/**
 * Phrase-lattice tagger (spec §7): per-token similarity tiers, phrase matching (with `#` numbers)
 * and a right-to-left DP that picks the best tiling. Every span keeps the other concepts that
 * matched exactly the same tokens (the lattice), so the intent level can still choose.
 */

export type Concept =
  | LexConcept
  | 'FILLER'
  | 'SFILLER'
  | 'CLASSIFIER'
  | 'COLOR'
  | 'PLACE'
  | 'UNSUP'
  | 'UNSAFE'
  | 'DEVICE'
  | 'OBJ'
  | 'DAY'
  | 'COUNT'
  | 'STEPS'
  | 'DURATION'
  | 'NUM'

export type EntryVal =
  | { k: 'color'; value: ColorValue; ambiguous: boolean }
  | { k: 'place'; place: PlaceEntry }
  | { k: 'unsup'; entry: UnsupportedEntry }
  | { k: 'device'; entry: DeviceEntry }
  | { k: 'obj'; entry: ObjectEntry }
  | { k: 'day'; offset: DayOffset }
  | { k: 'count'; value: CountValue }
  | { k: 'steps'; n?: number }
  | { k: 'dur'; unit: number; half?: boolean; halfOnly?: boolean }

export interface Entry {
  concept: Concept
  /** Canonical words; null = a number slot (`#`). */
  elems: (string | null)[]
  weight: number
  asciiPenalty: number
  /** The expanded phrase, e.g. "nhảy # bài". */
  text: string
  val?: EntryVal
}

export interface Cand {
  s: number
  tier: Tier
}

export interface Match {
  e: Entry
  start: number
  /** exclusive */
  end: number
  score: number
  mean: number
  exact: number
  nums: number[]
  /** Lexicon word and tier for every covered word token (number slots excluded). */
  hits: { pos: number; w: string; tier: Tier; s: number }[]
}

export interface Span {
  start: number
  end: number
  m: Match
  /** Other matches over exactly the same tokens, best first. */
  alts: Match[]
}

// ---------------------------------------------------------------------------------------- lexicon

/** Expand the phrase DSL: `a|b` alternatives, `[x]` optional, `#` number. */
export function expandPhrase(p: string): string[][] {
  let acc: string[][] = [[]]
  for (const raw of p.trim().split(/\s+/)) {
    const optional = raw.startsWith('[') && raw.endsWith(']')
    const body = optional ? raw.slice(1, -1) : raw
    const alts = body.split('|').filter(Boolean)
    const next: string[][] = []
    for (const a of acc) {
      if (optional) next.push(a)
      for (const alt of alts) next.push([...a, alt])
    }
    acc = next
  }
  return acc.filter((x) => x.length > 0)
}

const CONCEPT_WEIGHT: Partial<Record<Concept, number>> = {
  // place names are long and specific: "Lam Dong" beats colour "lam" + "đóng"
  PLACE: 1.1,
  FILLER: 0.1,
  CLASSIFIER: 0.1,
  OBJ: 0.3,
  NUM: 0.3,
}

export interface Lexicon {
  entries: Entry[]
  byFirst: Map<string, Entry[]>
  numFirst: Entry[]
  vocab: Set<string>
  byStrip: Map<string, string[]>
  byPho: Map<string, string[]>
  /** strip forms used for edit-distance search: [strip, canon][] */
  fuzzyList: [string, string][]
  maxLen: number
}

let LEX: Lexicon | null = null

function addEntries(out: Entry[], concept: Concept, defs: readonly PhraseDef[], val?: EntryVal): void {
  for (const d of defs) {
    const spec = typeof d === 'string' ? { p: d } : d
    for (const words of expandPhrase(spec.p.toLowerCase())) {
      const elems = words.map((w) => (w === '#' ? null : canonSyl(w.normalize('NFC'))))
      const e: Entry = {
        concept,
        elems,
        weight: spec.weight ?? CONCEPT_WEIGHT[concept] ?? 1,
        asciiPenalty: spec.asciiPenalty ?? 0,
        text: elems.map((x) => x ?? '#').join(' '),
      }
      if (val) e.val = val
      out.push(e)
    }
  }
}

function placeNames(p: PlaceEntry): string[] {
  const vi = p.vi
    .toLowerCase()
    .replace(/^tp\.\s*/, '')
    .replace(/[–-]/g, ' ')
    .replace(/\s+/g, ' ')
  return [vi, ...(p.aliases ?? [])]
}

export function getLexicon(): Lexicon {
  if (LEX) return LEX
  const entries: Entry[] = []
  for (const [c, defs] of Object.entries(CONCEPTS) as [LexConcept, readonly PhraseDef[]][])
    addEntries(entries, c, defs)
  addEntries(entries, 'FILLER', FILLERS)
  addEntries(entries, 'SFILLER', STRONG_FILLERS)
  addEntries(entries, 'CLASSIFIER', CLASSIFIERS)
  for (const c of COLORS) {
    const val: EntryVal = { k: 'color', value: c.value, ambiguous: c.ambiguous === true }
    addEntries(
      entries,
      'COLOR',
      c.phrases.map((p) => `[màu] ${p}`),
      val,
    )
  }
  for (const p of [...PROVINCES, ...CITIES])
    addEntries(entries, 'PLACE', placeNames(p), { k: 'place', place: p })
  for (const u of UNSUPPORTED) addEntries(entries, 'UNSUP', u.phrases, { k: 'unsup', entry: u })
  addEntries(entries, 'UNSAFE', UNSAFE.phrases, { k: 'unsup', entry: UNSAFE })
  for (const d of ABSENT_DEVICES) addEntries(entries, 'DEVICE', d.phrases, { k: 'device', entry: d })
  for (const o of OBJECTS) addEntries(entries, 'OBJ', o.phrases, { k: 'obj', entry: o })
  for (const d of DAYS) addEntries(entries, 'DAY', d.phrases, { k: 'day', offset: d.offset })
  for (const c of COUNTS) addEntries(entries, 'COUNT', c.phrases, { k: 'count', value: c.value })
  for (const s of STEPS)
    addEntries(entries, 'STEPS', s.phrases, s.n === undefined ? { k: 'steps' } : { k: 'steps', n: s.n })
  for (const d of DURATIONS) {
    const val: EntryVal = { k: 'dur', unit: d.unit }
    if (d.half) val.half = true
    if (d.halfOnly) val.halfOnly = true
    addEntries(entries, 'DURATION', d.phrases, val)
  }
  addEntries(entries, 'NUM', ['#'])

  const byFirst = new Map<string, Entry[]>()
  const numFirst: Entry[] = []
  const vocab = new Set<string>()
  let maxLen = 1
  for (const e of entries) {
    maxLen = Math.max(maxLen, e.elems.length)
    for (const w of e.elems) if (w) vocab.add(w)
    const f = e.elems[0]
    if (f === null || f === undefined) numFirst.push(e)
    else {
      const list = byFirst.get(f)
      if (list) list.push(e)
      else byFirst.set(f, [e])
    }
  }
  // words that must be "known" even though no phrase uses them alone (a known word is never
  // fuzzily rewritten into another one: "mười" stays mười, never the filler "mời")
  for (const w of [...TRAILING_PARTICLES, ...TIMER_LABELS.flatMap((l) => l.split(' ')), ...NUMBER_WORDS])
    vocab.add(canonSyl(w))
  const byStrip = new Map<string, string[]>()
  const byPho = new Map<string, string[]>()
  const fuzzyList: [string, string][] = []
  for (const w of vocab) {
    const s = strip(w)
    ;(byStrip.get(s) ?? byStrip.set(s, []).get(s)!).push(w)
    if (s.length >= 3 && /^[a-z]+$/.test(s)) {
      const p = phoKey(s)
      ;(byPho.get(p) ?? byPho.set(p, []).get(p)!).push(w)
    }
    if (s.length >= 3 && /^[a-z]+$/.test(s)) fuzzyList.push([s, w])
  }
  LEX = { entries, byFirst, numFirst, vocab, byStrip, byPho, fuzzyList, maxLen }
  return LEX
}

// ------------------------------------------------------------------------------ token similarity

/**
 * ASCII collision priors (spec §7.4 + critique): for a no-diacritics token whose stripped form
 * matches several lexicon words, the preferred reading wins ties; some readings are blocked unless
 * a context condition holds.
 */
const PREFER: Record<string, string> = {
  ngu: 'ngủ',
  nhay: 'nhảy',
  den: 'đèn',
  may: 'mấy',
  cuoi: 'cười',
  hong: 'hồng',
  an: 'ăn',
  mo: 'mở',
  lam: 'làm',
  do: 'đỏ',
  dung: 'dừng',
  toi: 'tôi',
  ban: 'bạn',
  ve: 'về',
  mua: 'múa',
  tim: 'tím',
  mai: 'mai',
  chao: 'chào',
  nuoc: 'nước',
  bat: 'bật',
  tat: 'tắt',
  quat: 'quạt',
  di: 'đi',
  lai: 'lại',
  nua: 'nữa',
  thu: 'thứ',
  gio: 'giờ',
  ngay: 'ngày',
  cam: 'cam',
}

const LIGHT_NEXT = new Set(['nha', 'nhe', 'di', 'thoi', 'luon', 'khong', 'ha', 'ta', 'roi', 'nhen', 'voi'])

/** Returns false when the reading `w` of token `k` is blocked in no-diacritics input. */
function asciiAllowed(w: string, toks: readonly Tok[], k: number): boolean {
  const t = toks[k]!
  const next = toks[k + 1]
  const prev = toks[k - 1]
  switch (t.strip) {
    case 'vay': // "vay" = vậy (filler) unless "vay tay" (critique fix)
      return w !== 'vẫy' || next?.strip === 'tay'
    case 'rua': // "rua" = rứa at the end; rửa needs an object
      if (w === 'rửa') return !!next && !LIGHT_NEXT.has(next.strip)
      return true
    case 'mua': // "mua" (buy) needs something to buy ("mua chuoi", "di mua", "mua sam"); else múa;
      // mưa (rain) wins in a weather context ("mai mua khong", "troi mua")
      if (w === 'múa')
        return (
          !['troi', 'co', 'nay', 'mai', 'hom', 'dang', 'se', 'bi', 'con', 'mot'].includes(
            prev?.strip ?? '',
          ) &&
          !['khong', 'hong', 'chua', 'to', 'nho', 'lon', 'nhieu', 'phun', 'rao', 'da', 'lanh'].includes(
            next?.strip ?? '',
          )
        )
      if (w !== 'mua') return true
      return (
        prev?.strip === 'di' ||
        next?.strip === 'sam' ||
        findObject(toks, k + 1, Math.min(toks.length, k + 5)) !== undefined
      )
    case 'tim': // after màu / đèn / sang it is the colour tím, not tìm (find)
      return w !== 'tìm' || !['mau', 'den', 'sang', 'thanh', 'qua'].includes(prev?.strip ?? '')
    case 'nau': // "mau nau" is the colour brown, not nấu (cook)
      return w !== 'nấu' || prev?.strip !== 'mau'
    case 've': // "ve" is về, never vẽ
      return w !== 'vẽ'
    case 'nam': // năm (year / five) or a place ("miền Nam"); nằm (lie down) only as a command of its own
      if (w !== 'nằm') return true
      if (next) return ['xuong', 'ngua', 'ra', 'di', 'nghi', 'yen', 'im'].includes(next.strip)
      return k === 0 || ['di', 'hay', 'phai', 'duoc'].includes(prev?.strip ?? '')
    case 'lam': // làm (do); the colour lam only after màu / xanh / đèn / sang / thành
      return w !== 'lam' || ['mau', 'xanh', 'den', 'sang', 'thanh', 'qua'].includes(prev?.strip ?? '')
    case 'cua': // của (of); cửa (door) only as the object of mở / đóng … or before sổ / chính
      return (
        w !== 'cửa' ||
        ['mo', 'dong', 'canh', 'khoa', 'cai', 'bat', 'tat', 'ra'].includes(prev?.strip ?? '') ||
        ['so', 'chinh', 'ra'].includes(next?.strip ?? '') ||
        k === 0
      )
    case 'te': // tệ (bad); té (fall) only as "té ngã", "bị té", "té rồi" or on its own
      return (
        w !== 'té' ||
        ['nga', 'xuong', 'nhao', 'ra', 'lan', 'roi'].includes(next?.strip ?? '') ||
        prev?.strip === 'bi' ||
        (k === 0 && !next)
      )
    case 'hon': // hơn (more) after an adjective ("nhảy cao hơn"); hôn (kiss) someone
      if (w !== 'hôn') return true
      if (next)
        return ['toi', 'tui', 'minh', 'ban', 'em', 'anh', 'chi', 'con', 'chau', 'ba', 'ong'].includes(
          next.strip,
        )
      return ![
        'cao',
        'nhanh',
        'manh',
        'nhe',
        'cham',
        'lon',
        'nho',
        'to',
        'it',
        'nhieu',
        'xa',
        'gan',
        'dep',
        'gioi',
        'hay',
        'tot',
        'nua',
      ].includes(prev?.strip ?? '')
    case 'lau': // lâu (long); lau (wipe) only with something to wipe
      return (
        w !== 'lau' ||
        (!!next &&
          !['qua', 'lam', 'vay', 'the', 'roi', 'chua', 'khong', 'hong', 'nua', 'ghe'].includes(next.strip) &&
          !['bao', 'sao', 'lau'].includes(prev?.strip ?? ''))
      )
    case 'ngu': // "ban ngu qua" is an insult, not "go to sleep"
      return (
        w !== 'ngủ' ||
        !(
          ['ban', 'may', 'mi', 'do', 'that'].includes(prev?.strip ?? '') &&
          ['qua', 'the', 'vay', 'lam', 'ghe', 'vl'].includes(next?.strip ?? '')
        )
      )
    case 'dung': // đừng (don't) before a verb; dừng / đứng (stop / stand) alone or with lại, lên …
      if (w !== 'dừng' && w !== 'đứng') return true
      return (
        !next ||
        [
          ...['lai', 'ngay', 'tay', 'di', 'nha', 'nhe', 'nao', 'thoi', 'luon', 'het', 'ban', 'han', 'hen'],
          ...['len', 'day', 'yen', 'im', 'thang', 'do', 'cho', 'o', 'truoc', 'sau', 'gan', 'xa'],
        ].includes(next.strip)
      )
    case 'do': // đỏ (red) only as a colour, dở (bad) only as a judgement; otherwise đó / do
      if (w === 'đỏ')
        return ['mau', 'den', 'sang', 'thanh', 'qua', 'xanh'].includes(prev?.strip ?? '') || k === 0
      if (w === 'dở')
        return (
          ['qua', 'te', 'ec', 'om', 'the', 'vay', 'lam', 'ghe', 'that'].includes(next?.strip ?? '') ||
          ['ban', 'may', 'mi', 'that', 'qua'].includes(prev?.strip ?? '')
        )
      return true
    case 'mot': // một (one); mốt (the day after tomorrow) only in "ngày mốt", "bữa mốt"
      return w !== 'mốt' || prev?.strip === 'ngay' || prev?.strip === 'bua' || prev?.strip === 'hom'
    case 'cho': // the filler "cho", never chở (drive) or chớ (don't)
      return w !== 'chở' && w !== 'chớ'
    case 'ban': // "ban" is bạn, never bán (sell) or bắn (shoot)
      return w !== 'bán' && w !== 'bắn'
    case 'da': // đá (kick) only in "đá bóng"; otherwise đã / Đà (Nẵng)
      return w !== 'đá' || next?.strip === 'bong'
    case 'ca': // ca (sing) only in "ca hát"; otherwise cả / cá
      return w !== 'ca' || next?.strip === 'hat'
    default:
      return true
  }
}

/**
 * Candidate lexicon words for one token, with their similarity (spec §7.1).
 * A token that is itself a known word does not fuzzy-match other words.
 */
const COMMON_ASCII = new Set<string>(COMMON_ASCII_WORDS)
const COMMON_LEVEL = new Set<string>(COMMON_LEVEL_WORDS.map((w) => canonSyl(w)))

/**
 * Is `w` a plausible reading of the accented token `a`? Tones are phonemic ("cháy" is not "chạy"),
 * so only the tones Central/Southern speech merges (hỏi, ngã, nặng: "nhãy", "nhạy" → nhảy) or
 * left-out vowel marks with the same tone ("bạt" → bật) count as the same word.
 */
function toneVariant(a: string, w: string): boolean {
  const ta = toneOf(a)
  const tw = toneOf(w)
  const ba = [...baseOf(a)]
  const bw = [...baseOf(w)]
  // the tone mark left out ("bât đèn", "mây giờ", "thời tiêt"), unless the plain word is common
  if (ta === '' && tw !== '' && ba.join('') === bw.join('')) return !COMMON_LEVEL.has(a)
  if (toneClass(ta) !== toneClass(tw)) return false
  if (ba.join('') === bw.join('')) return ta !== tw
  // a vowel mark left out or added by mistake ("bạt", "quặt"); đ and d are different letters
  const plain = (x: string, y: string): boolean => x !== 'đ' && y !== 'đ' && x === strip(y)
  return ba.length === bw.length && ba.every((c, i) => c === bw[i] || plain(c, bw[i]!) || plain(bw[i]!, c))
}

/** The vowel as heard: Southern "-anh / -ach" is "-ăn / -ăt" ("xăn" = xanh). */
function heardNucleus(base: string): string {
  const v = nucleusOf(base)
  return v === 'a' && /(nh|ch)$/.test(base) ? 'ă' : v
}

/** Same tone (class) and the same vowel: only the consonants differ ("đèng" → đèn, "tắc" → tắt). */
function samePhoneticSyllable(a: string, w: string): boolean {
  return toneClass(toneOf(a)) === toneClass(toneOf(w)) && heardNucleus(baseOf(a)) === heardNucleus(baseOf(w))
}

/**
 * Candidate lexicon words for one token, with their similarity (spec §7.1).
 * A token that is itself a known word does not fuzzy-match other words.
 */
export function candidatesFor(
  toks: readonly Tok[],
  k: number,
  mode: 'accented' | 'ascii',
  lex: Lexicon,
): Map<string, Cand> {
  const t = toks[k]!
  const out = new Map<string, Cand>()
  if (t.op || !/\p{L}/u.test(t.text)) return out
  const known = lex.vocab.has(t.text)
  const asciiMode = t.ascii && mode === 'ascii'
  // the exact reading obeys the no-diacritics priors too ("mua di" is múa, not "buy")
  if (known && (!asciiMode || asciiAllowed(t.text, toks, k)))
    out.set(t.text, { s: asciiMode ? 0.92 : 1, tier: 'exact' })
  // a common word typed without diacritics inside accented text is taken as typed ("tim", "lan")
  const common = t.ascii && mode === 'accented' && COMMON_ASCII.has(t.text)
  for (const w of lex.byStrip.get(t.strip) ?? []) {
    if (w === t.text) continue
    if (t.ascii) {
      if (!asciiAllowed(w, toks, k)) continue
      // a diacritic-free word that is itself known, inside accented input, is mostly taken as typed
      // ("cho", "chi"); the other readings stay usable inside longer phrases ("thời tiết Ha Tinh")
      if (mode === 'ascii') out.set(w, { s: 0.92, tier: 'strip' })
      else if (known) out.set(w, { s: 0.7, tier: 'strip_known' })
      else if (common) out.set(w, { s: 0.6, tier: 'strip_known' })
      else out.set(w, { s: 0.92, tier: 'strip' })
    } else if (known) {
      // different diacritics on a known word ("vậy"): only inside a longer phrase
      out.set(w, { s: 0.56, tier: 'strip_known' })
    } else if (toneVariant(t.text, w)) {
      out.set(w, { s: 0.8, tier: 'tone' })
    } else if (baseOf(t.text) === baseOf(w)) {
      // another tone: a different word, usable only inside a longer phrase ("mụa một bài")
      out.set(w, { s: 0.56, tier: 'strip_known' })
    }
  }
  if (t.ascii) {
    const pref = PREFER[t.strip]
    if (pref && out.size > 1 && out.has(pref)) {
      for (const [w, c] of out) if (w !== pref) c.s -= 0.02
    }
  }
  const knownStrip = known || (t.ascii && lex.byStrip.has(t.strip))
  if (known && !t.ascii && t.strip.length >= 3) {
    // a known word may still be a regional final / onset merger inside a longer phrase only
    // ("năm phúc" = năm phút, "màu hồn" = màu hồng)
    for (const w of lex.byPho.get(t.pho) ?? [])
      if (!out.has(w) && samePhoneticSyllable(t.text, w)) out.set(w, { s: 0.6, tier: 'phonetic' })
  }
  if (knownStrip || common || /\d/.test(t.text)) return out
  // phonetic tier (an accented token keeps its tone and vowel: "lát" is not "lắc")
  if (t.strip.length >= 2) {
    for (const w of lex.byPho.get(t.pho) ?? []) {
      if (out.has(w) || (!t.ascii && !samePhoneticSyllable(t.text, w))) continue
      out.set(w, { s: 0.72, tier: 'phonetic' })
    }
  }
  // edit-distance tiers (typos keep the tone: "quên" is not "quét"); none when a same-syllable
  // reading exists ("nhãy" is nhảy, not also nhậu)
  if (t.strip.length >= 4 && ![...out.values()].some((c) => c.s >= 0.8)) {
    const tone = toneClass(toneOf(t.text))
    for (const [s, w] of lex.fuzzyList) {
      if (out.has(w) || Math.abs(s.length - t.strip.length) > 2) continue
      if (!t.ascii && toneClass(toneOf(w)) !== tone) continue
      // an accented typo is a doubled / dropped letter or a swap, never another letter ("khóa" ≠ khóc)
      if (!t.ascii && s.length === t.strip.length && !isTransposition(t.strip, s)) continue
      const d = osa(t.strip, s, 2)
      if (d === 1) {
        const transposed = isTransposition(t.strip, s)
        if (t.strip[0] === s[0] || transposed) out.set(w, { s: 0.68, tier: 'edit1' })
      } else if (d === 2 && t.strip.length >= 7 && s.length >= 7) out.set(w, { s: 0.58, tier: 'edit2' })
    }
  }
  return out
}

function isTransposition(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const diff: number[] = []
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i)
  return (
    diff.length === 2 &&
    diff[1] === diff[0]! + 1 &&
    a[diff[0]!] === b[diff[1]!] &&
    a[diff[1]!] === b[diff[0]!]
  )
}

// ------------------------------------------------------------------------------------ matching

export interface TagInput {
  toks: readonly Tok[]
  cands: readonly Map<string, Cand>[]
  runs: readonly NumRun[]
  blocked: readonly boolean[]
  mode: 'accented' | 'ascii'
}

const RANK: Partial<Record<Concept, number>> = {
  FILLER: -2,
  SFILLER: -1,
  CLASSIFIER: -2,
  NUM: -1,
  OBJ: -1,
  QMARK: -1,
}

function tryMatch(inp: TagInput, e: Entry, i: number, runAt: Map<number, NumRun>): Match | null {
  let pos = i
  let sum = 0
  let exact = 0
  const nums: number[] = []
  const hits: Match['hits'] = []
  for (const el of e.elems) {
    if (el === null) {
      const run = runAt.get(pos)
      if (!run) return null
      nums.push(run.value)
      pos = run.end
      sum += 1
      continue
    }
    if (pos >= inp.toks.length || inp.blocked[pos]) return null
    const c = inp.cands[pos]!.get(el)
    if (!c || c.s < 0.55) return null
    sum += c.s
    if (c.tier === 'exact') exact++
    hits.push({ pos, w: el, tier: c.tier, s: c.s })
    pos++
  }
  const len = e.elems.length
  const mean = sum / len
  if (mean < 0.66) return null
  // fillers are function words: they match as typed (or with restored diacritics), never loosely
  if (
    (e.concept === 'SFILLER' || e.concept === 'FILLER') &&
    hits.some((h) => h.tier !== 'exact' && h.tier !== 'strip')
  )
    return null
  // a capitalised word inside a sentence is a name: read loosely only as a place ("Ha Noi")
  if (
    e.concept !== 'PLACE' &&
    hits.some((h) => h.tier !== 'exact' && inp.toks[h.pos]!.cap && !inp.toks[h.pos]!.initial)
  )
    return null
  if (len === 1 && e.elems[0] !== null) {
    const h = hits[0]!
    if (h.s < 0.8) {
      const need = h.tier === 'phonetic' ? 3 : 4
      if (inp.toks[i]!.strip.length < need) return null
    }
  }
  const score = mean * (len + 0.35 * (len - 1)) * e.weight - (inp.mode === 'ascii' ? e.asciiPenalty : 0)
  return { e, start: i, end: pos, score, mean, exact, nums, hits }
}

/** All phrase matches starting at every position. */
export function allMatches(inp: TagInput): Match[][] {
  const lex = getLexicon()
  const runAt = new Map(inp.runs.map((r) => [r.start, r]))
  const out: Match[][] = inp.toks.map(() => [])
  for (let i = 0; i < inp.toks.length; i++) {
    if (inp.blocked[i]) continue
    const seen = new Set<Entry>()
    const tryList = (list: readonly Entry[] | undefined): void => {
      for (const e of list ?? []) {
        if (seen.has(e)) continue
        seen.add(e)
        const m = tryMatch(inp, e, i, runAt)
        if (m) out[i]!.push(m)
      }
    }
    for (const w of inp.cands[i]!.keys()) tryList(lex.byFirst.get(w))
    if (runAt.has(i)) tryList(lex.numFirst)
  }
  return out
}

const better = (a: Match, b: Match): boolean => {
  if (Math.abs(a.score - b.score) > 1e-9) return a.score > b.score
  if (a.exact !== b.exact) return a.exact > b.exact
  return (RANK[a.e.concept] ?? 0) > (RANK[b.e.concept] ?? 0)
}

/** Right-to-left DP over the matches: the best tiling, with lattice alternatives per span. */
export function tile(inp: TagInput, matches: Match[][]): Span[] {
  const n = inp.toks.length
  const best = new Array<number>(n + 1).fill(0)
  const choice = new Array<Match | null>(n + 1).fill(null)
  for (let i = n - 1; i >= 0; i--) {
    best[i] = best[i + 1]!
    choice[i] = null
    if (inp.blocked[i]) continue
    for (const m of matches[i]!) {
      const s = m.score + best[m.end]!
      const cur = choice[i]
      const tie = cur !== null && Math.abs(s - best[i]!) <= 1e-9
      if (s > best[i]! + 1e-9 || (tie && (m.end > cur.end || (m.end === cur.end && better(m, cur))))) {
        best[i] = s
        choice[i] = m
      }
    }
  }
  const spans: Span[] = []
  let i = 0
  while (i < n) {
    const m = choice[i]
    if (!m) {
      i++
      continue
    }
    const alts = matches[i]!.filter((x) => x !== m && x.end === m.end && x.e.concept !== m.e.concept)
    alts.sort((a, b) => b.score - a.score)
    spans.push({ start: m.start, end: m.end, m, alts })
    i = m.end
  }
  return spans
}

/** Is there a non-filler phrase of ≥ 2 tokens that ends exactly at token j (sim ≥ 0.8)? */
export function phraseEndsAt(inp: TagInput, j: number): boolean {
  const lex = getLexicon()
  const runAt = new Map(inp.runs.map((r) => [r.start, r]))
  for (let s = Math.max(0, j - lex.maxLen + 1); s < j; s++) {
    for (const w of inp.cands[s]!.keys()) {
      for (const e of lex.byFirst.get(w) ?? []) {
        if (e.elems.length < 2 || e.concept === 'FILLER' || e.concept === 'SFILLER') continue
        const m = tryMatch(inp, e, s, runAt)
        if (m && m.end === j + 1 && m.hits.every((h) => h.s >= 0.8)) return true
      }
    }
    if (runAt.has(s)) {
      for (const e of lex.numFirst) {
        if (e.elems.length < 2) continue
        const m = tryMatch(inp, e, s, runAt)
        if (m && m.end === j + 1 && m.hits.every((h) => h.s >= 0.8)) return true
      }
    }
  }
  return false
}
