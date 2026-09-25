import type {
  Action,
  ActionType,
  DayOffset,
  Emotion,
  MathToken,
  TurnDirection,
  UnsupportedReason,
  WalkDirection,
} from './actions'
import type { ColorId } from './colors'
import type { Bilingual, Lang } from './lang'
import type { FanSpeed } from './room'
import type { WeatherData } from './weather'

/**
 * Replies are stored as references ({ key, params }) and rendered at display time by the pure
 * `renderReply(ref, lang)` in src/replies. Toggling VI/EN therefore re-renders past bubbles and
 * history. The ENGINE emits refs after executing (it knows about no-ops, weather results, caps);
 * the PARSER never writes replies.
 *
 * Every param is plain JSON. Instants are ISO strings; renderers format them in Vietnam time.
 */
export interface ReplyParams {
  // ---- motion (acknowledgements)
  'motion.jump': { count: number }
  'motion.dance': { seconds: number }
  'motion.wave': { count: number }
  'motion.nod': { count: number }
  'motion.shake_head': { count: number }
  'motion.thumbs_up': { count: number }
  'motion.punch': { count: number }
  'motion.walk': { direction: WalkDirection; steps: number }
  /** The walk was cut short by the room's edge. */
  'motion.walk_blocked': Record<string, never>
  'motion.run': { seconds: number }
  'motion.turn': { direction: TurnDirection; count: number }
  'motion.sit': Record<string, never>
  'motion.already_sitting': Record<string, never>
  'motion.stand': Record<string, never>
  'motion.already_standing': Record<string, never>
  'motion.sleep': Record<string, never>
  'motion.already_sleeping': Record<string, never>
  'motion.wake': Record<string, never>
  'motion.already_awake': Record<string, never>
  'motion.fall': Record<string, never>
  /** After play-dead, when the robot gets back up. */
  'motion.fall_recover': Record<string, never>
  'motion.emote': { emotion: Emotion }
  'motion.stop': Record<string, never>
  /** One acknowledgement for a chain of motion actions ("Được! Nhảy 3 lần rồi vẫy tay nè."). */
  'motion.chain': { actions: Action[] }

  // ---- information
  'info.time': { iso: string }
  'info.date': { iso: string; dayOffset: DayOffset }
  'info.weekday': { iso: string; dayOffset: DayOffset }
  /** iso = the reference instant ("now"); renderer computes the lunar values. */
  'info.lunar': {
    iso: string
    query: 'date' | 'year' | 'tet' | 'ram' | 'mung1'
    dayOffset: DayOffset
    /** (parser) "năm sau" = +1, "năm ngoái" = −1 (query 'year'). */
    yearOffset?: number
    /** (parser) A named lunar month for 'ram' / 'mung1' ("rằm tháng Giêng"). */
    month?: number
  }
  'info.weather': {
    place: Bilingual
    dayOffset: 0 | 1 | 2
    aspect: 'general' | 'rain' | 'temp'
    data: WeatherData
  }
  'info.weather_error': { place: Bilingual; reason: 'offline' | 'timeout' | 'http' }
  /** (parser) The place asked about is not in the gazetteer: say so, then give `place` (the default). */
  'info.weather_unknown_place': { place: Bilingual }
  'info.math': { expr: MathToken[]; result: number }
  'info.math_error': { expr: MathToken[]; error: 'div0' | 'overflow' }

  // ---- timers
  'timer.start': { seconds: number; label?: string }
  'timer.done': { label?: string }
  /** label = only that reminder was cancelled ("hủy nhắc uống thuốc"). */
  'timer.cancel': { label?: string }
  /** label = no timer with that label ("hủy nhắc uống thuốc" when there is none; others may run). */
  'timer.none': { label?: string }
  /** A RINGING timer was dismissed (the pill's X, or "hủy hẹn giờ" while it rings): "Đã tắt chuông." */
  'timer.dismissed': { label?: string }
  'timer.status': { remainingSec: number; label?: string }
  'timer.limit': { max: number }
  /** (parser) A reminder/timer without a duration: "Bạn muốn mình nhắc sau bao lâu?". Whitelisted label. */
  'timer.ask': { label?: string }
  /** (parser) An alarm at a clock time ("lúc 9 giờ"): not supported yet, say "sau 30 phút" instead. */
  'timer.clock_time': { label?: string }

  // ---- conversation
  /** iso used for the part of day (sáng/trưa/chiều/tối). */
  'chat.greet': { iso: string }
  'chat.thanks': Record<string, never>
  'chat.goodbye': Record<string, never>
  'chat.praise': Record<string, never>
  'chat.insult': Record<string, never>
  /** wer = test normalized WER as a fraction, for the 'project' topic. */
  'chat.intro': { topic: 'who' | 'creator' | 'age' | 'project'; wer?: number }
  'chat.capabilities': Record<string, never>
  /** index into the joke list; renderer wraps modulo its length. */
  'chat.joke': { index: number }
  'chat.smalltalk': { topic: 'how_are_you' | 'love' | 'user_sad' | 'user_tired' | 'user_happy' }
  /** (parser) "tôi bị ngã", "cứu tôi với": the robot cannot call for help → call 115 / family. */
  'chat.emergency': Record<string, never>
  'pref.voice': { on: boolean }
  'pref.language': { lang: Lang }

  // ---- smart home
  'home.light_on': { color?: ColorId }
  'home.light_off': Record<string, never>
  'home.light_color': { color: ColorId }
  'home.light_already': { on: boolean }
  /** Plain "xanh": set to teal, ask "xanh lá hay xanh dương?". */
  'home.xanh_ambiguous': Record<string, never>
  'home.black_is_off': Record<string, never>
  'home.fan_on': { speed: FanSpeed }
  'home.fan_off': Record<string, never>
  'home.fan_speed': { speed: FanSpeed; delta?: 1 | -1 }
  'home.fan_already': { on: boolean }
  'home.fan_speed_limit': { speed: FanSpeed }
  /** (parser) A delayed lamp/fan command ("tắt đèn sau 5 phút"): not supported yet, nothing switched. */
  'home.later': { device: 'light' | 'fan'; power: 'on' | 'off' }

  // ---- meta
  unsupported: { reason: UnsupportedReason; verb: Bilingual; object?: Bilingual; alternative?: ActionType }
  /** emotion = the negated emotion ("đừng khóc" → "mình không buồn nữa đâu"). */
  negation: { target: ActionType; emotion?: Emotion }
  /** Nothing understood. suggestions are Vietnamese commands shown as chips. Never echoes the input. */
  unknown: { suggestions: string[] }
  /** Some parts were not understood (appended after the understood parts). */
  partial_unknown: Record<string, never>
  /**
   * Some repeat count / steps / spins / seconds were cut to the limit (LIMITS in core/actions).
   * `caps` names each capped action with its unit ("xoay tối đa 5 vòng và nhảy tối đa 10 lần");
   * without it (a cut no single action shows, e.g. a repeated chain) the note is generic.
   */
  'note.capped': { max: number; caps?: CapInfo[] }
  'note.nothing_to_repeat': Record<string, never>
  'note.too_many_actions': { max: number }
  welcome: { layout: 'side' | 'stacked' }
  'robot.not_ready': Record<string, never>
  'asr.empty': Record<string, never>
  'asr.error': {
    kind:
      | 'network'
      | 'timeout'
      | 'too_large'
      | 'unsupported_media'
      | 'unprocessable'
      | 'busy'
      | 'http'
      | 'bad_response'
  }
  'error.generic': Record<string, never>
}

/** The unit a limit is counted in: lần / bước / vòng / giây — times / steps / spins / seconds. */
export type CapUnit = 'times' | 'steps' | 'spins' | 'seconds'

/** One capped action for 'note.capped': e.g. { action: 'turn', unit: 'spins', max: 5 }. */
export interface CapInfo {
  action: ActionType
  unit: CapUnit
  max: number
}

export type ReplyKey = keyof ReplyParams

export type ReplyRef = {
  [K in ReplyKey]: {
    key: K
    params: ReplyParams[K]
    /** Picks among template variants deterministically. */
    seed?: number
  }
}[ReplyKey]

/** Build a typed ReplyRef. */
export function reply<K extends ReplyKey>(key: K, params: ReplyParams[K], seed?: number): ReplyRef {
  return { key, params, seed } as ReplyRef
}

export type ReplyTone = 'normal' | 'sorry' | 'alert' | 'question'

export interface RenderedReply {
  /** Shown in the bubble / history. */
  text: string
  /** Sent to TTS (spells out words a voice would mangle, e.g. "PhoWhisper", "WER"). */
  speech: string
  tone: ReplyTone
}
