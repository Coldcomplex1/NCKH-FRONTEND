import type { MotionScript } from '@/motion/script'
import type { ColorId } from './colors'
import type { Bilingual, Lang } from './lang'
import type { PlaceRef } from './places'
import type { FanSpeed } from './room'

/**
 * The single contract between the command parser (rule-based now, Qwen later) and the robot engine.
 * Every value is plain JSON so an LLM parser can emit it and tests can snapshot it.
 *
 * Directions are SCREEN-relative: 'left' means toward the viewer's left.
 */

export type DayOffset = -1 | 0 | 1 | 2
export type Emotion = 'happy' | 'sad' | 'angry' | 'surprised'
export type MathOp = '+' | '-' | '*' | '/'
export type MathToken = number | MathOp

export type WalkDirection = 'forward' | 'backward' | 'left' | 'right' | 'to_user' | 'home'
export type TurnDirection = 'left' | 'right' | 'around' | 'spin'

export type UnsupportedReason = 'physical' | 'device_absent' | 'out_of_scope' | 'unsafe'

export type Action =
  // ---- motion
  | { type: 'jump'; count: number }
  | { type: 'dance'; seconds: number }
  | { type: 'wave'; count: number }
  | { type: 'nod'; count: number }
  | { type: 'shake_head'; count: number }
  | { type: 'thumbs_up'; count: number }
  | { type: 'punch'; count: number }
  /** steps: 1–10. 'to_user' = "lại đây", 'home' = "về chỗ cũ". */
  | { type: 'walk'; direction: WalkDirection; steps: number }
  | { type: 'run'; seconds: number }
  /** 'spin' = full 360° turns (count); left/right = face screen-left/right; around = 180°. */
  | { type: 'turn'; direction: TurnDirection; count: number }
  | { type: 'sit' }
  | { type: 'stand' }
  | { type: 'sleep' }
  | { type: 'wake' }
  /** "giả chết", "ngã", "nằm xuống" → Death clip, then gets back up. */
  | { type: 'fall' }
  | { type: 'emote'; emotion: Emotion }
  | { type: 'stop' }
  /**
   * A move Qwen invented for a command the robot has no built-in animation for (source 'llm').
   * `move.name` is the filtered display name; `count` = how many times the whole move is performed.
   */
  | { type: 'custom_move'; move: MotionScript; count: number }
  // ---- information
  | { type: 'time' }
  | { type: 'date'; dayOffset: DayOffset }
  | { type: 'weekday'; dayOffset: DayOffset }
  /**
   * yearOffset: "năm sau / năm ngoái là năm con gì" (query 'year'); month: a named lunar month for
   * 'ram' / 'mung1' ("rằm tháng Giêng", "Trung Thu" = rằm tháng 8).
   */
  | {
      type: 'lunar'
      query: 'date' | 'year' | 'tet' | 'ram' | 'mung1'
      dayOffset: DayOffset
      yearOffset?: number
      month?: number
    }
  | { type: 'timer_start'; seconds: number; label?: string }
  /** label set = cancel only the timer(s) with that label ("hủy nhắc uống thuốc"); none = all. */
  | { type: 'timer_cancel'; label?: string }
  | { type: 'timer_status' }
  /**
   * place null = default place (TP.HCM). placeUnknown = the user named a place that is not in the
   * gazetteer (never echoed): the robot says so, then answers for the default place.
   */
  | {
      type: 'weather'
      place: PlaceRef | null
      dayOffset: 0 | 1 | 2
      aspect: 'general' | 'rain' | 'temp'
      placeUnknown?: boolean
    }
  /** result null when error is set. */
  | { type: 'math'; expr: MathToken[]; result: number | null; error?: 'div0' | 'overflow' }
  // ---- conversation
  | { type: 'greet' }
  | { type: 'thanks' }
  | { type: 'goodbye' }
  | { type: 'praise' }
  | { type: 'insult' }
  | { type: 'intro'; topic: 'who' | 'creator' | 'age' | 'project' }
  | { type: 'capabilities' }
  | { type: 'joke' }
  | { type: 'smalltalk'; topic: 'how_are_you' | 'love' | 'user_sad' | 'user_tired' | 'user_happy' }
  | { type: 'voice'; on: boolean }
  | { type: 'set_language'; lang: Lang }
  // ---- simulated smart home
  /** color implies power on. */
  | { type: 'light'; power?: 'on' | 'off'; color?: ColorId }
  | { type: 'fan'; power?: 'on' | 'off'; speed?: FanSpeed; speedDelta?: 1 | -1 }
  // ---- meta
  | {
      type: 'unsupported'
      reason: UnsupportedReason
      /** What was asked, e.g. { vi: 'ăn', en: 'eat' }. */
      verb: Bilingual
      /**
       * Only set when the object is on the parser's safe whitelist (e.g. chuối → a banana).
       * Arbitrary user text is NEVER echoed back (public demo safety).
       */
      object?: Bilingual
      /** Something similar the robot CAN do, performed after the refusal. */
      alternative?: Action
    }
  /** "đừng nhảy", "không cần bật đèn": acknowledged, nothing happens. */
  | { type: 'ack_negation'; target: ActionType; emotion?: Emotion }
  /**
   * Understood, but it cannot run as said, so the robot asks or explains (never a refusal):
   * 'timer_duration' = a reminder/timer without a duration ("nhắc tôi uống thuốc"),
   * 'clock_time' = an alarm at a clock time ("lúc 9 giờ", not supported yet),
   * 'device_later' = a delayed lamp/fan command ("tắt đèn sau 5 phút", not supported yet),
   * 'move_failed' = Qwen could not invent the move asked for (timeout, error): "try again later".
   * `label` is a whitelisted reminder label (TIMER_LABELS), never free text.
   */
  | {
      type: 'clarify'
      need: 'timer_duration' | 'clock_time' | 'device_later' | 'move_failed'
      label?: string
      device?: 'light' | 'fan'
      power?: 'on' | 'off'
    }
  /** "tôi bị ngã", "cứu tôi với", "gọi cấp cứu": a possible real emergency (serious reply, no clip). */
  | { type: 'emergency' }

export type ActionType = Action['type']
export type ActionOf<T extends ActionType> = Extract<Action, { type: T }>

export const MOTION_TYPES = [
  'jump',
  'dance',
  'wave',
  'nod',
  'shake_head',
  'thumbs_up',
  'punch',
  'walk',
  'run',
  'turn',
  'sit',
  'stand',
  'sleep',
  'wake',
  'fall',
  'emote',
  'stop',
  'custom_move',
] as const satisfies readonly ActionType[]

export const INFO_TYPES = [
  'time',
  'date',
  'weekday',
  'lunar',
  'timer_start',
  'timer_cancel',
  'timer_status',
  'weather',
  'math',
  'clarify',
] as const satisfies readonly ActionType[]

export const CHAT_TYPES = [
  'greet',
  'thanks',
  'goodbye',
  'praise',
  'insult',
  'intro',
  'capabilities',
  'joke',
  'smalltalk',
  'voice',
  'set_language',
  'emergency',
] as const satisfies readonly ActionType[]

export const HOME_TYPES = ['light', 'fan'] as const satisfies readonly ActionType[]

export type ActionCategory = 'motion' | 'info' | 'chat' | 'home' | 'meta'

export function actionCategory(type: ActionType): ActionCategory {
  if ((MOTION_TYPES as readonly string[]).includes(type)) return 'motion'
  if ((INFO_TYPES as readonly string[]).includes(type)) return 'info'
  if ((CHAT_TYPES as readonly string[]).includes(type)) return 'chat'
  if ((HOME_TYPES as readonly string[]).includes(type)) return 'home'
  return 'meta'
}

/** Hard limits shared by parser and engine. */
export const LIMITS = {
  /** Max characters of input text (typed or ASR). */
  maxInputChars: 200,
  /** Max repeat count for one action ("nhảy 50 lần" → 10). */
  maxCount: 10,
  /** Max repeat count when the user prefers reduced motion. */
  maxCountReducedMotion: 3,
  /** Max actions per utterance. */
  maxActions: 6,
  maxSteps: 10,
  maxSpins: 5,
  /** Seconds, for dance/run. */
  maxMotionSeconds: 60,
  maxTimerSeconds: 24 * 3600,
  maxTimers: 3,
} as const
