import type { MathOp } from '@/core/actions'
import type { DialectRegion, SubstitutionKind } from '@/core/parser'

/** One word of the normalized stream. */
export interface Tok {
  /** Lowercase, NFC, canonical tone placement. */
  text: string
  /** Lowercase NFC as typed (for substitution "from" texts: "nhảyy", not the canonical "nhaỷy"). */
  raw: string
  /** Diacritic-free form of `text`. */
  strip: string
  /** Phonetic key of `strip`. */
  pho: string
  /** The word has no diacritics. */
  ascii: boolean
  /** Typed with a capital letter. */
  cap: boolean
  /** First word of a sentence. */
  initial: boolean
  op?: MathOp | '='
  /** Index into the pre-tagging substitution list, when this token came from a rewrite. */
  sub?: number
}

/** A sentence piece before clause splitting: words plus whether it ended with "?". */
export interface Sentence {
  toks: Tok[]
  question: boolean
  /** The piece follows a comma: a soft break ("hẹn giờ, 5 phút" is one command). */
  afterComma?: boolean
}

/** A rewrite recorded against token positions; converted to character offsets at the end. */
export interface PendingSub {
  from: string
  to: string
  kind: SubstitutionKind
  region?: DialectRegion[]
  /** Set later, when the token stream is final. */
  toks: Tok[]
}

/** 'tone' = same syllable, a merged tone (hỏi / ngã / nặng: "nhãy", "nhạy" → nhảy). */
export type Tier = 'exact' | 'strip' | 'strip_known' | 'tone' | 'phonetic' | 'edit1' | 'edit2'
