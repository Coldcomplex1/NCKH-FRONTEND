import type { Action, MathToken } from './actions'
import type { Bilingual, Lang } from './lang'
import type { Note, Suggestion } from './parser'
import type { ReplyRef } from './replies'
import type { WeatherData } from './weather'

/** What the demo pipeline hands to the robot engine after parsing. */
export interface EngineRequest {
  turnId: string
  actions: Action[]
  notes: Note[]
  /** true when part (or all) of the input was not understood. */
  hasUnknown: boolean
  suggestions: Suggestion[]
  lang: Lang
}

export interface EngineOutcome {
  status: 'done' | 'interrupted' | 'error'
  /** In the order they were shown. Also written to the turn in the store. */
  replies: ReplyRef[]
}

/**
 * The robot engine (src/engine). A plain-TS singleton, no React.
 * It plans and runs animations, speaks (the ONLY module that calls TTS), applies room changes,
 * shows info cards, fetches weather, and owns timers.
 */
export interface RobotEngine {
  /** Interrupts the current run (room state and timers are kept) and runs this request. */
  submit(req: EngineRequest): Promise<EngineOutcome>
  /**
   * While Qwen invents a move for this turn: interrupt the current run, face the viewer, say
   * "Để mình nghĩ động tác…" and hold a thinking pose until the next submit() replaces it.
   */
  think(turnId: string): void
  /** Abort the current run, TTS and in-flight fetches. */
  interrupt(): void
  cancelTimer(id: string): void
  /** Walk back to the home spot (the "Về chỗ cũ" button). */
  returnHome(): void
}

/** The one info card shown in the robot panel. Rendered by the demo UI (DOM overlay). */
export type InfoCard =
  | { kind: 'time'; iso: string }
  | { kind: 'date'; iso: string; dayOffset: -1 | 0 | 1 | 2 }
  | { kind: 'lunar'; iso: string; query: 'date' | 'year' | 'tet' | 'ram' | 'mung1' }
  | {
      kind: 'weather'
      status: 'loading' | 'ok' | 'error'
      place: Bilingual
      dayOffset: 0 | 1 | 2
      data?: WeatherData
    }
  | { kind: 'math'; expr: MathToken[]; result: number | null; error?: 'div0' | 'overflow' }
  | { kind: 'capabilities' }
  | { kind: 'about' }
