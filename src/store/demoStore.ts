import { create } from 'zustand'
import type { Action } from '@/core/actions'
import type { InfoCard } from '@/core/engine'
import type { ParseResult } from '@/core/parser'
import type { ReplyRef, ReplyTone } from '@/core/replies'
import { DEFAULT_ROBOT, type RobotSemanticState } from '@/core/robot'
import { DEFAULT_ROOM, type RoomState } from '@/core/room'

/**
 * Semantic demo state shared by the pipeline (writes turns/stages), the engine (writes robot, room,
 * timers, card, bubble, run, live) and the UI (reads everything). Per-frame values (robot position,
 * yaw, animation weights) NEVER go through this store.
 */

export type StageId = 'input' | 'asr' | 'qwen' | 'nlu' | 'robot'
export type StageState = 'idle' | 'active' | 'done' | 'skipped' | 'error' | 'soon'
export type TurnSource = 'text' | 'chip' | 'mic' | 'file'

export interface Turn {
  id: string
  at: number
  source: TurnSource
  /** What the robot "heard": typed text, or the ASR transcript. */
  heard: string
  asr?: { raw: string; corrected?: string; durationSec?: number; latencyMs?: number }
  parse?: ParseResult
  replies: ReplyRef[]
  status: 'processing' | 'done' | 'interrupted' | 'error'
  error?: string
  /** Qwen is inventing a move for part of this command (the robot holds its thinking pose). */
  creating?: boolean
  /** Qwen is post-correcting the transcript / typed text. */
  correcting?: boolean
  /** A typed command Qwen corrected (no or wrong diacritics); `heard` is then the corrected text. */
  typedFix?: { original: string; corrected: string }
}

export interface Bubble {
  id: number
  ref: ReplyRef
  tone: ReplyTone
  /** true while TTS is reading it */
  speaking: boolean
}

export interface TimerState {
  id: string
  durationMs: number
  endsAt: number
  label?: string
  /** true for a few seconds after it fires */
  ringing?: boolean
}

export interface RunState {
  id: number
  turnId: string
  /** index of the step being executed, and total step count */
  index: number
  total: number
  status: 'running' | 'done' | 'interrupted' | 'error'
}

export interface SceneState {
  status: 'loading' | 'ready' | 'no-webgl' | 'error'
  /** 0–1 model download progress, null when unknown */
  progress: number | null
}

/** Screen-reader announcement (rendered by the LiveRegion in the robot panel). */
export interface LiveMessage {
  id: number
  ref: ReplyRef
  assertive: boolean
}

export const MAX_TURNS = 10

export const INITIAL_STAGES: Record<StageId, StageState> = {
  input: 'idle',
  asr: 'idle',
  qwen: 'soon',
  nlu: 'idle',
  robot: 'idle',
}

interface DemoState {
  turns: Turn[] // newest first
  stages: Record<StageId, StageState>
  room: RoomState
  robot: RobotSemanticState
  timers: TimerState[]
  card: { id: number; card: InfoCard; expiresAt: number | null } | null
  bubble: Bubble | null
  run: RunState | null
  scene: SceneState
  live: LiveMessage | null
  /** Actions of the most recent turn (set at parse time so interrupted commands still repeat). */
  lastActions: Action[]
  /** Whether AI-invented moves (Qwen) are available on this site ('unknown' until checked). */
  aiMoves: 'unknown' | 'on' | 'off'
  /** Whether the ASR backend (GET /health) answers ('unknown' until checked; only with VITE_ASR_URL). */
  asr: 'unknown' | 'ok' | 'loading' | 'offline'
  /** Whether Qwen post-correction (GET /api/correct) is available ('unknown' until checked). */
  correction: 'unknown' | 'on' | 'off'

  startTurn(turn: Omit<Turn, 'replies' | 'status'>): void
  patchTurn(id: string, patch: Partial<Turn>): void
  appendTurnReply(id: string, ref: ReplyRef): void
  clearHistory(): void
  setStages(patch: Partial<Record<StageId, StageState>>): void
  resetStages(): void
  patchRoom(patch: { light?: Partial<RoomState['light']>; fan?: Partial<RoomState['fan']> }): void
  patchRobot(patch: Partial<RobotSemanticState>): void
  addTimer(t: TimerState): void
  patchTimer(id: string, patch: Partial<TimerState>): void
  removeTimer(id: string): void
  showCard(card: InfoCard, ttlMs: number | null): number
  clearCard(id?: number): void
  setBubble(ref: ReplyRef, tone?: ReplyTone): number
  patchBubble(id: number, patch: Partial<Omit<Bubble, 'id'>>): void
  clearBubble(id?: number): void
  setRun(run: RunState | null): void
  patchRun(id: number, patch: Partial<RunState>): void
  setScene(patch: Partial<SceneState>): void
  announce(ref: ReplyRef, assertive?: boolean): void
  setLastActions(actions: Action[]): void
  setAiMoves(state: 'on' | 'off'): void
  setAsr(state: 'ok' | 'loading' | 'offline'): void
  setCorrection(state: 'on' | 'off'): void
}

let seq = 0
const nextId = () => ++seq

export const useDemo = create<DemoState>()((set, get) => ({
  turns: [],
  stages: { ...INITIAL_STAGES },
  room: structuredClone(DEFAULT_ROOM),
  robot: { ...DEFAULT_ROBOT },
  timers: [],
  card: null,
  bubble: null,
  run: null,
  scene: { status: 'loading', progress: null },
  live: null,
  lastActions: [],
  aiMoves: 'unknown',
  asr: 'unknown',
  correction: 'unknown',

  startTurn: (turn) =>
    set((s) => ({
      turns: [{ ...turn, replies: [], status: 'processing' as const }, ...s.turns].slice(0, MAX_TURNS),
    })),
  patchTurn: (id, patch) =>
    set((s) => ({ turns: s.turns.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
  appendTurnReply: (id, ref) =>
    set((s) => ({ turns: s.turns.map((t) => (t.id === id ? { ...t, replies: [...t.replies, ref] } : t)) })),
  clearHistory: () => set({ turns: [] }),

  setStages: (patch) => set((s) => ({ stages: { ...s.stages, ...patch } })),
  resetStages: () => set({ stages: { ...INITIAL_STAGES } }),

  patchRoom: (patch) =>
    set((s) => ({
      room: { light: { ...s.room.light, ...patch.light }, fan: { ...s.room.fan, ...patch.fan } },
    })),
  patchRobot: (patch) => set((s) => ({ robot: { ...s.robot, ...patch } })),

  addTimer: (t) => set((s) => ({ timers: [...s.timers, t] })),
  patchTimer: (id, patch) =>
    set((s) => ({ timers: s.timers.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
  removeTimer: (id) => set((s) => ({ timers: s.timers.filter((t) => t.id !== id) })),

  showCard: (card, ttlMs) => {
    const id = nextId()
    set({ card: { id, card, expiresAt: ttlMs === null ? null : Date.now() + ttlMs } })
    return id
  },
  clearCard: (id) => {
    const cur = get().card
    if (cur && (id === undefined || cur.id === id)) set({ card: null })
  },

  setBubble: (ref, tone = 'normal') => {
    const id = nextId()
    set({ bubble: { id, ref, tone, speaking: false } })
    return id
  },
  patchBubble: (id, patch) => {
    const cur = get().bubble
    if (cur && cur.id === id) set({ bubble: { ...cur, ...patch } })
  },
  clearBubble: (id) => {
    const cur = get().bubble
    if (cur && (id === undefined || cur.id === id)) set({ bubble: null })
  },

  setRun: (run) => set({ run }),
  patchRun: (id, patch) => {
    const cur = get().run
    if (cur && cur.id === id) set({ run: { ...cur, ...patch } })
  },
  setScene: (patch) => set((s) => ({ scene: { ...s.scene, ...patch } })),
  announce: (ref, assertive = false) => set({ live: { id: nextId(), ref, assertive } }),
  setLastActions: (actions) => set({ lastActions: actions }),
  setAiMoves: (aiMoves) => set({ aiMoves }),
  setAsr: (asr) => set({ asr }),
  setCorrection: (correction) => set({ correction }),
}))

/** Non-React access (engine, pipeline). */
export const demo = () => useDemo.getState()
