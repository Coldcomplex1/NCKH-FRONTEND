import type { Action, ActionType } from './actions'
import type { Bilingual, Lang } from './lang'
import type { PlaceRef } from './places'
import type { RoomState } from './room'
import type { Activity, Posture } from './robot'

/** Fine-grained dialect regions used by the lexicon. */
export type DialectRegion = 'central' | 'ngheTinh' | 'hue' | 'quang' | 'southern'
/** The three macro regions used by ViMD and the research section. */
export type MacroRegion = 'North' | 'Central' | 'South'

export function macroRegion(r: DialectRegion): MacroRegion {
  return r === 'southern' ? 'South' : 'Central'
}

/** Everything the parser may read. Built once per turn by `buildParseContext()` in the demo pipeline. */
export interface ParseContext {
  now: Date
  /** Reply language (= UI language). Commands are always Vietnamese. */
  lang: Lang
  robot: { posture: Posture; activity: Activity }
  room: RoomState
  /** Actions of the previous turn, for "lần nữa" / "làm lại". */
  lastActions: Action[]
  timers: { id: string; endsAt: number; label?: string; ringing?: boolean }[]
  defaultPlace: PlaceRef
}

export interface ParseOptions {
  source?: 'text' | 'asr'
  /** ASR n-best hypotheses (future): parse each and keep the most confident. */
  alternatives?: string[]
  signal?: AbortSignal
}

export type SubstitutionKind = 'dialect' | 'spelling' | 'chat' | 'fuzzy' | 'phonetic'

/** A word the parser rewrote before matching, e.g. "chừ" → "bây giờ". */
export interface Substitution {
  from: string
  to: string
  /** Character offsets of `to` inside `ParseResult.normalizedText` (end exclusive). */
  start: number
  end: number
  kind: SubstitutionKind
  region?: DialectRegion[]
}

export interface ClauseInfo {
  text: string
  negated: boolean
  question: boolean
  /**
   * Content words of the clause that no action used ("moonwalk" in "nhảy moonwalk", "như con cua"
   * in "đi như con cua"). Particles, numbers and fillers never count. Drives the AI-move router.
   */
  unexplained?: string[]
  /** The clause contains a negator ("đừng", "không"…), whether or not an action matched. */
  hasNegator?: boolean
}

export interface ParsedAction {
  action: Action
  /** 0–1 */
  confidence: number
  /** The (normalized) words that triggered this action. */
  matched: string
  clause: number
  source: 'rule' | 'carry' | 'implicit' | 'repeat' | 'llm'
  negated?: boolean
}

export interface UnknownInfo {
  text: string
  clause: number
  reason: 'empty' | 'no_match' | 'low_confidence'
}

/** A clickable suggestion. `say` is always a Vietnamese command. */
export interface Suggestion {
  say: string
  label: Bilingual
}

export type NoteKind = 'capped' | 'black_is_off' | 'xanh_ambiguous' | 'nothing_to_repeat' | 'truncated'
export interface Note {
  kind: NoteKind
  data?: Record<string, string | number>
}

export type ParseStatus =
  /** Everything understood and doable. */
  | 'ok'
  /** Some parts understood, some not (or some impossible). */
  | 'partial'
  /** Understood, but every requested thing is impossible for the robot. */
  | 'impossible'
  /** Nothing understood. */
  | 'unknown'

export interface ParseResult {
  /** Parser id, e.g. 'rule-v1'. */
  parser: string
  input: string
  /** Lowercase, canonical tones, dialect/spelling fixes applied, punctuation removed. */
  normalizedText: string
  /** Content words only (fillers/particles dropped): "what I understood". */
  coreText: string
  inputMode: 'accented' | 'ascii'
  substitutions: Substitution[]
  /** Count of dialect words recognised per region (drives the "Từ địa phương đã nhận ra" badge). */
  dialectHints: Partial<Record<DialectRegion, number>>
  clauses: ClauseInfo[]
  /** In execution order. Unsupported actions are included (the engine refuses them politely). */
  actions: ParsedAction[]
  unknown: UnknownInfo[]
  suggestions: Suggestion[]
  /** Min confidence over actions; 0 if none. */
  confidence: number
  notes: Note[]
  status: ParseStatus
  elapsedMs: number
}

export interface CommandParser {
  readonly id: string
  parse(text: string, ctx: ParseContext, opts?: ParseOptions): Promise<ParseResult>
}

/** Derive the status from actions/unknown. Parsers should use this for consistency. */
export function deriveStatus(
  actions: { action: { type: ActionType } }[],
  unknown: UnknownInfo[],
): ParseStatus {
  const doable = actions.filter((a) => a.action.type !== 'unsupported').length
  const impossible = actions.length - doable
  if (actions.length === 0) return 'unknown'
  if (doable === 0) return unknown.length ? 'partial' : 'impossible'
  if (impossible > 0 || unknown.length > 0) return 'partial'
  return 'ok'
}
