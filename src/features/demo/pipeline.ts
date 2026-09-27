import { AsrError, transcribe, type TranscribeOptions, type TranscribeResponse } from '@/audio/asrClient'
import { toWav16k } from '@/audio/decode'
import { MAX_AUDIO_SECONDS } from '@/audio/validateFile'
import { LIMITS } from '@/core/actions'
import type { ParseContext, ParseOptions, ParseResult } from '@/core/parser'
import { DEFAULT_PLACE } from '@/core/places'
import { engine } from '@/engine'
import { ENV } from '@/lib/env'
import { speaker } from '@/speech'
import { demo, type StageId, type StageState, type TurnSource } from '@/store/demoStore'
import { getPrefs } from '@/store/prefsStore'
import { correctionAvailable, requestCorrection } from './correctAi'
import { mergeMoves, planEscalations, type MoveResult } from './escalate'
import { cachedMove, motionAiAvailable, requestMove } from './motionAi'
import { asrErrorCode, errorRef, type TurnErrorCode } from './turnErrors'

/**
 * The demo pipeline: input → (ASR) → (Qwen correction) → parse → (AI moves) → turn log → robot engine.
 *
 * - Qwen correction (/api/correct, see correctAi.ts): every ASR transcript, and typed text without
 *   diacritics or with words the parser had to guess, is post-corrected (recognition / typing errors
 *   only; regional words stay). On any failure the robot acts on the uncorrected text.
 * - AI moves: clauses the rules cannot act out (moonwalk, lộn nhào, a crab walk…) are sent to Qwen
 *   through /api/motion (see escalate.ts). While it works the robot holds a thinking pose; moves
 *   this browser already has are replayed at once. Off entirely when the site has no Qwen key.
 *
 * - `speaker.prime()` is the FIRST, synchronous statement of every submit (it must run inside the
 *   click/keypress for iOS/Chrome speech activation rules).
 * - An identical submit within 300 ms is ignored (double taps, key repeat).
 * - Every submit aborts the previous turn's parse/ASR; stale continuations never touch the stages.
 * - The ENGINE owns everything after parsing (bubble, speech, room, timers); this module never writes
 *   bubbles. Pipeline failures go to `turn.error` (shown in the TranscriptCard) and are announced.
 */

export type TextSource = Extract<TurnSource, 'text' | 'chip'>
export type AudioSource = Extract<TurnSource, 'mic' | 'file'>

export interface SubmitResult {
  status: 'done' | 'interrupted' | 'error' | 'ignored'
  turnId?: string
  error?: TurnErrorCode
}

export interface AsrSettled {
  ok: boolean
  cancelled?: boolean
  error?: TurnErrorCode
}

export interface SubmitAudioOptions {
  /** Cancels this turn (the audio panel's "Hủy" button). */
  signal?: AbortSignal
  /** Called once the ASR step is over (success, failure or cancel) — the robot may still be acting. */
  onAsrSettled?(result: AsrSettled): void
}

export const DUPLICATE_WINDOW_MS = 300

/**
 * The parser (lexicons + rules) is its own chunk, so the robot paints sooner: `prefetchParser()`
 * starts the download right after first paint, and a command typed before it arrives just waits
 * for it. Once loaded it is called synchronously (no extra tick between submit and parse). A failed
 * download is forgotten, so the next command tries again.
 */
type ParserModule = typeof import('@/nlu')
let parserModule: ParserModule | null = null
let parserLoading: Promise<ParserModule> | null = null

function loadParser(): Promise<ParserModule> {
  parserLoading ??= import('@/nlu').then(
    (m) => (parserModule = m),
    (err: unknown) => {
      parserLoading = null
      throw err
    },
  )
  return parserLoading
}

export function prefetchParser(): Promise<void> {
  return loadParser().then(
    () => {},
    () => {},
  )
}

let current: { turnId: string; controller: AbortController } | null = null
let lastSubmit: { key: unknown; at: number } | null = null
let turnSeq = 0

/** Everything the parser may read, snapshotted from the stores for one turn. */
export function buildParseContext(now: Date = new Date()): ParseContext {
  const s = demo()
  return {
    now,
    lang: getPrefs().lang,
    robot: { posture: s.robot.posture, activity: s.robot.activity },
    room: { light: { ...s.room.light }, fan: { ...s.room.fan } },
    lastActions: s.lastActions,
    timers: s.timers.map((t) => ({ id: t.id, endsAt: t.endsAt, label: t.label, ringing: t.ringing })),
    defaultPlace: DEFAULT_PLACE,
  }
}

/** Type or tap a Vietnamese command. */
export function submitCommand(text: string, source: TextSource = 'text'): Promise<SubmitResult> {
  speaker.prime() // keep FIRST and synchronous
  const clean = cleanInput(text)
  if (!clean || isDuplicate(clean)) return Promise.resolve({ status: 'ignored' })

  const { turnId, controller } = beginTurn()
  demo().startTurn({ id: turnId, at: Date.now(), source, heard: clean })
  demo().setStages({ input: 'done', asr: 'skipped', qwen: qwenIdle('skipped'), nlu: 'active', robot: 'idle' })
  // Chips are our own well-formed examples (some deliberately without diacritics): never corrected.
  return understandAndAct(turnId, controller.signal, clean, { source: 'text' }, source === 'text')
}

/** Send a recording or an uploaded file through ASR, then the same flow as text. */
export function submitAudio(
  blob: Blob,
  source: AudioSource,
  opts: SubmitAudioOptions = {},
): Promise<SubmitResult> {
  speaker.prime() // keep FIRST and synchronous
  if (isDuplicate(blob)) return Promise.resolve({ status: 'ignored' })

  const { turnId, controller } = beginTurn()
  const onCancel = () => controller.abort()
  if (opts.signal?.aborted) controller.abort()
  else opts.signal?.addEventListener('abort', onCancel, { once: true })

  demo().startTurn({ id: turnId, at: Date.now(), source, heard: '' })
  demo().setStages({ input: 'done', asr: 'active', qwen: qwenIdle('idle'), nlu: 'idle', robot: 'idle' })
  return runAudio(turnId, controller.signal, blob, opts).finally(() =>
    opts.signal?.removeEventListener('abort', onCancel),
  )
}

/** Test helper: forget the duplicate guard and abort any turn in flight. */
export function resetPipeline(): void {
  current?.controller.abort()
  current = null
  lastSubmit = null
}

// ---------------------------------------------------------------------------------------------

function cleanInput(text: string): string {
  return text.normalize('NFC').trim().slice(0, LIMITS.maxInputChars).trim()
}

/** The Qwen stage before it runs: "sắp có" until the site says correction is available. */
function qwenIdle(whenOn: StageState): StageState {
  return demo().correction === 'on' ? whenOn : 'soon'
}

const STATUS_RANK: Record<ParseResult['status'], number> = { ok: 3, partial: 2, impossible: 1, unknown: 0 }

/**
 * Typed text worth sending to Qwen: written without diacritics, or with words the parser had to
 * guess (spelling / typo / sound-alike fixes) or could not read at all — usually wrong diacritics.
 */
export function needsTypedFix(text: string, parse: ParseResult): boolean {
  if (!/\p{L}{2,}/u.test(text)) return false
  if (parse.inputMode === 'ascii') return true
  if (parse.unknown.length > 0) return true
  return parse.substitutions.some((s) => s.kind === 'spelling' || s.kind === 'fuzzy' || s.kind === 'phonetic')
}

function isDuplicate(key: unknown): boolean {
  const now = Date.now()
  if (lastSubmit && lastSubmit.key === key && now - lastSubmit.at < DUPLICATE_WINDOW_MS) return true
  lastSubmit = { key, at: now }
  return false
}

function beginTurn(): { turnId: string; controller: AbortController } {
  current?.controller.abort()
  const controller = new AbortController()
  const turnId = `t${Date.now().toString(36)}-${(++turnSeq).toString(36)}`
  current = { turnId, controller }
  return current
}

const isCurrent = (turnId: string) => current?.turnId === turnId

function interrupted(turnId: string, patch: { parse?: ParseResult; creating?: boolean } = {}): SubmitResult {
  demo().patchTurn(turnId, { ...patch, status: 'interrupted' })
  return { status: 'interrupted', turnId }
}

function fail(turnId: string, stage: StageId, code: TurnErrorCode): SubmitResult {
  demo().patchTurn(turnId, { status: 'error', error: code })
  if (isCurrent(turnId)) {
    demo().setStages({ [stage]: 'error' })
    demo().announce(errorRef(code))
  }
  return { status: 'error', turnId, error: code }
}

async function understandAndAct(
  turnId: string,
  signal: AbortSignal,
  text: string,
  opts: Pick<ParseOptions, 'source' | 'alternatives'>,
  typed = false,
): Promise<SubmitResult> {
  let parse: ParseResult
  let parser: ReturnType<ParserModule['getParser']>
  try {
    const { getParser } = parserModule ?? (await loadParser())
    parser = getParser()
    parse = await parser.parse(text, buildParseContext(), { ...opts, signal })
  } catch (err) {
    if (signal.aborted) return interrupted(turnId)
    console.error('[pipeline] parse failed', err)
    return fail(turnId, 'nlu', 'generic')
  }
  // Superseded while parsing: record what we understood, but never act on it.
  if (signal.aborted) return interrupted(turnId, { parse })

  // Typed without / with wrong diacritics: Qwen corrects it, and the robot acts on the correction
  // unless the parser understands it less than the original.
  if (typed && needsTypedFix(text, parse) && (await correctionAvailable())) {
    if (signal.aborted) return interrupted(turnId, { parse })
    demo().patchTurn(turnId, { correcting: true })
    demo().setStages({ qwen: 'active' })
    const fix = await requestCorrection(text, 'text', { signal })
    demo().patchTurn(turnId, { correcting: false })
    if (signal.aborted) return interrupted(turnId, { parse })
    if (fix.kind === 'ok' && fix.changed) {
      const fixed = cleanInput(fix.corrected)
      try {
        const fixedParse = await parser.parse(fixed, buildParseContext(), { ...opts, signal })
        if (signal.aborted) return interrupted(turnId, { parse })
        if (STATUS_RANK[fixedParse.status] >= STATUS_RANK[parse.status]) {
          demo().patchTurn(turnId, { heard: fixed, typedFix: { original: text, corrected: fixed } })
          parse = fixedParse
          text = fixed
        }
      } catch {
        if (signal.aborted) return interrupted(turnId, { parse })
        // keep the original reading
      }
    }
    if (isCurrent(turnId)) demo().setStages({ qwen: fix.kind === 'ok' ? 'done' : 'error' })
  }

  // AI moves (Qwen): the clauses the rules cannot act out get a move invented for them.
  const escalations = planEscalations(parse)
  if (escalations.length > 0 && (await motionAiAvailable())) {
    if (signal.aborted) return interrupted(turnId, { parse })
    const known = escalations.map((e) => cachedMove(e))
    let results: (MoveResult | null)[] = known
    if (known.some((r) => r === null)) {
      demo().patchTurn(turnId, { parse, creating: true })
      engine.think(turnId)
      results = await Promise.all(
        escalations.map((e, i) => known[i] ?? requestMove(e, { signal, utterance: text })),
      )
      if (signal.aborted) return interrupted(turnId, { parse, creating: false })
    }
    parse = mergeMoves(parse, escalations, results as MoveResult[])
  }

  demo().patchTurn(turnId, { parse, creating: false })
  const actions = parse.actions.map((a) => a.action)
  if (actions.length > 0) demo().setLastActions(actions)
  demo().setStages({ nlu: 'done', robot: 'active' })

  let outcome
  try {
    outcome = await engine.submit({
      turnId,
      actions,
      notes: parse.notes,
      hasUnknown: parse.unknown.length > 0,
      suggestions: parse.suggestions,
      lang: getPrefs().lang,
    })
  } catch (err) {
    console.error('[pipeline] engine failed', err)
    return fail(turnId, 'robot', 'generic')
  }

  demo().patchTurn(turnId, { status: outcome.status })
  if (isCurrent(turnId)) {
    demo().setStages({
      robot: outcome.status === 'done' ? 'done' : outcome.status === 'error' ? 'error' : 'idle',
    })
  }
  return { status: outcome.status, turnId }
}

async function runAudio(
  turnId: string,
  signal: AbortSignal,
  blob: Blob,
  opts: SubmitAudioOptions,
): Promise<SubmitResult> {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  let res: TranscribeResponse
  let knownDuration: number | null = null
  try {
    const prepared = await toWav16k(blob, { maxSec: MAX_AUDIO_SECONDS })
    knownDuration = prepared.durationSec
    if (signal.aborted) throw new AsrError('aborted')
    res = await runAsr(prepared.blob, { signal, filename: prepared.filename })
  } catch (err) {
    const kind = err instanceof AsrError ? err.kind : 'network'
    if (signal.aborted || kind === 'aborted') {
      if (isCurrent(turnId)) demo().setStages({ asr: 'idle', nlu: 'idle', robot: 'idle' })
      opts.onAsrSettled?.({ ok: false, cancelled: true })
      return interrupted(turnId)
    }
    if (!(err instanceof AsrError)) console.error('[pipeline] ASR failed', err)
    const code = err instanceof AsrError ? asrErrorCode(err.kind) : 'generic'
    opts.onAsrSettled?.({ ok: false, error: code })
    return fail(turnId, 'asr', code)
  }

  const raw = res.text.trim()
  let corrected = res.corrected_text?.trim() || undefined
  let heard = cleanInput(corrected ?? raw)
  const latencyMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)
  const asrInfo = { raw, durationSec: res.duration ?? knownDuration ?? undefined, latencyMs }
  demo().patchTurn(turnId, { heard, asr: { ...asrInfo, corrected } })

  if (!heard) {
    opts.onAsrSettled?.({ ok: false, error: 'asr.empty' })
    return fail(turnId, 'asr', 'asr.empty')
  }
  opts.onAsrSettled?.({ ok: true })

  // Qwen post-correction, unless the backend already corrected it. "done" once Qwen answered (even
  // with "nothing to fix"); "sắp có" when the site has no correction step.
  let qwen: StageState = corrected ? 'done' : 'soon'
  if (!corrected && (await correctionAvailable())) {
    if (signal.aborted) return interrupted(turnId)
    demo().setStages({ asr: 'done', qwen: 'active' })
    demo().patchTurn(turnId, { correcting: true })
    const fix = await requestCorrection(raw, 'asr', { signal })
    demo().patchTurn(turnId, { correcting: false })
    if (signal.aborted) return interrupted(turnId)
    qwen = fix.kind === 'ok' ? 'done' : 'error'
    if (fix.kind === 'ok' && fix.changed && cleanInput(fix.corrected)) {
      corrected = fix.corrected
      heard = cleanInput(corrected)
      demo().patchTurn(turnId, { heard, asr: { ...asrInfo, corrected } })
    }
  }

  demo().setStages({ asr: 'done', qwen, nlu: 'active' })
  return understandAndAct(turnId, signal, heard, { source: 'asr', alternatives: res.alternatives })
}

async function runAsr(blob: Blob, opts: TranscribeOptions): Promise<TranscribeResponse> {
  if (ENV.asr.enabled) return transcribe(blob, opts)
  // `import.meta.env.DEV` right here (not only inside ENV) is statically false in a production build,
  // so the bundler drops this branch and emits no mockAsr chunk at all.
  if (import.meta.env.DEV && ENV.asr.mock) {
    const { mockTranscribe } = await import('@/audio/mockAsr')
    return mockTranscribe(blob, opts)
  }
  throw new AsrError('disabled')
}
