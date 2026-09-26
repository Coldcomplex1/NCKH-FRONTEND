import {
  AlarmClock,
  AlarmClockOff,
  Angry,
  Ban,
  Bot,
  Calculator,
  CalendarDays,
  CircleSlash,
  Clock,
  CloudSun,
  Fan,
  Footprints,
  Frown,
  Hand,
  HandHeart,
  Heart,
  Hourglass,
  Languages,
  Laugh,
  Lightbulb,
  MessageCircle,
  MoonStar,
  Music,
  Octagon,
  PersonStanding,
  WandSparkles,
  RotateCw,
  Armchair,
  Smile,
  Sparkles,
  Sunrise,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  Wand2,
  Zap,
  Rabbit,
  ArrowUpFromLine,
  MoveVertical,
  ChevronsDown,
  CircleQuestionMark,
  Siren,
  type LucideIcon,
} from 'lucide-react'
import {
  actionCategory,
  type Action,
  type ActionCategory,
  type ActionType,
  type DayOffset,
  type Emotion,
  type TurnDirection,
  type WalkDirection,
} from '@/core/actions'
import { LIGHT_COLORS } from '@/core/colors'
import type { Lang } from '@/core/lang'
import { DEFAULT_PLACE } from '@/core/places'
import type { Fmt } from '@/i18n'
import { formatDuration, formatMathExpr } from './format'

/**
 * Localized label + icon for EVERY ActionType (the intent chips in the transcript and history).
 * `Record<ActionType, …>` makes a new action type in src/core fail to compile until it is labelled.
 */

export const ACTION_ICONS: Record<ActionType, LucideIcon> = {
  jump: ArrowUpFromLine,
  dance: Music,
  wave: Hand,
  nod: MoveVertical,
  shake_head: CircleSlash,
  thumbs_up: ThumbsUp,
  punch: Zap,
  walk: Footprints,
  run: Rabbit,
  turn: RotateCw,
  sit: Armchair,
  stand: PersonStanding,
  sleep: MoonStar,
  wake: Sunrise,
  fall: ChevronsDown,
  emote: Smile,
  stop: Octagon,
  custom_move: WandSparkles,
  time: Clock,
  date: CalendarDays,
  weekday: CalendarDays,
  lunar: MoonStar,
  timer_start: AlarmClock,
  timer_cancel: AlarmClockOff,
  timer_status: Hourglass,
  weather: CloudSun,
  math: Calculator,
  greet: Hand,
  thanks: HandHeart,
  goodbye: Hand,
  praise: Heart,
  insult: ThumbsDown,
  intro: Bot,
  capabilities: Sparkles,
  joke: Laugh,
  smalltalk: MessageCircle,
  voice: Volume2,
  set_language: Languages,
  light: Lightbulb,
  fan: Fan,
  unsupported: Ban,
  ack_negation: Wand2,
  clarify: CircleQuestionMark,
  emergency: Siren,
}

const EMOTION_ICONS: Partial<Record<Emotion, LucideIcon>> = { sad: Frown, angry: Angry }

const vi = {
  labels: {
    jump: 'Nhảy',
    dance: 'Nhảy múa',
    wave: 'Vẫy tay',
    nod: 'Gật đầu',
    shake_head: 'Lắc đầu',
    thumbs_up: 'Giơ ngón cái',
    punch: 'Đấm',
    walk: 'Đi',
    run: 'Chạy',
    turn: 'Quay',
    sit: 'Ngồi xuống',
    stand: 'Đứng dậy',
    sleep: 'Đi ngủ',
    wake: 'Thức dậy',
    fall: 'Giả vờ ngã',
    emote: 'Biểu cảm',
    stop: 'Dừng lại',
    custom_move: 'Động tác mới',
    time: 'Xem giờ',
    date: 'Xem ngày',
    weekday: 'Xem thứ',
    lunar: 'Âm lịch',
    timer_start: 'Hẹn giờ',
    timer_cancel: 'Hủy hẹn giờ',
    timer_status: 'Hỏi hẹn giờ',
    weather: 'Thời tiết',
    math: 'Tính toán',
    greet: 'Chào hỏi',
    thanks: 'Cảm ơn',
    goodbye: 'Tạm biệt',
    praise: 'Lời khen',
    insult: 'Lời chê',
    intro: 'Giới thiệu',
    capabilities: 'Khả năng',
    joke: 'Kể chuyện cười',
    smalltalk: 'Trò chuyện',
    voice: 'Giọng đọc',
    set_language: 'Đổi ngôn ngữ',
    light: 'Đèn',
    fan: 'Quạt',
    unsupported: 'Không làm được',
    ack_negation: 'Không làm',
    clarify: 'Hỏi lại',
    emergency: 'Khẩn cấp',
  } satisfies Record<ActionType, string>,
  clarify: {
    timer_duration: 'cần biết sau bao lâu',
    clock_time: 'giờ đồng hồ (chưa hỗ trợ)',
    device_later: 'hẹn giờ thiết bị (chưa hỗ trợ)',
    move_failed: 'chưa nghĩ ra động tác',
  },
  walk: {
    forward: 'tới trước',
    backward: 'lùi lại',
    left: 'sang trái',
    right: 'sang phải',
    to_user: 'lại gần',
    home: 'về chỗ cũ',
  } satisfies Record<WalkDirection, string>,
  turn: {
    left: 'sang trái',
    right: 'sang phải',
    around: 'ra sau',
    spin: 'một vòng',
  } satisfies Record<TurnDirection, string>,
  emotion: { happy: 'vui', sad: 'buồn', angry: 'giận', surprised: 'ngạc nhiên' } satisfies Record<
    Emotion,
    string
  >,
  day: { '-1': 'hôm qua', '0': 'hôm nay', '1': 'ngày mai', '2': 'ngày kia' },
  lunar: { date: 'ngày', year: 'năm', tet: 'Tết', ram: 'rằm', mung1: 'mùng 1' },
  aspect: { general: '', rain: 'mưa', temp: 'nhiệt độ' },
  intro: { who: 'là ai', creator: 'ai làm ra', age: 'tuổi', project: 'dự án' },
  smalltalk: {
    how_are_you: 'hỏi thăm',
    love: 'tình cảm',
    user_sad: 'bạn buồn',
    user_tired: 'bạn mệt',
    user_happy: 'bạn vui',
  },
  on: 'bật',
  off: 'tắt',
  speed: (n: number): string => `số ${n}`,
  faster: 'mạnh hơn',
  slower: 'nhẹ hơn',
  steps: (n: number): string => `${n} bước`,
  langs: { vi: 'tiếng Việt', en: 'tiếng Anh' },
}

const en: typeof vi = {
  labels: {
    jump: 'Jump',
    dance: 'Dance',
    wave: 'Wave',
    nod: 'Nod',
    shake_head: 'Shake head',
    thumbs_up: 'Thumbs up',
    punch: 'Punch',
    walk: 'Walk',
    run: 'Run',
    turn: 'Turn',
    sit: 'Sit down',
    stand: 'Stand up',
    sleep: 'Sleep',
    wake: 'Wake up',
    fall: 'Play dead',
    emote: 'Emotion',
    stop: 'Stop',
    custom_move: 'New move',
    time: 'Time',
    date: 'Date',
    weekday: 'Weekday',
    lunar: 'Lunar calendar',
    timer_start: 'Timer',
    timer_cancel: 'Cancel timer',
    timer_status: 'Timer status',
    weather: 'Weather',
    math: 'Math',
    greet: 'Greeting',
    thanks: 'Thanks',
    goodbye: 'Goodbye',
    praise: 'Praise',
    insult: 'Insult',
    intro: 'Introduction',
    capabilities: 'Capabilities',
    joke: 'Joke',
    smalltalk: 'Small talk',
    voice: 'Voice',
    set_language: 'Language',
    light: 'Light',
    fan: 'Fan',
    unsupported: "Can't do",
    ack_negation: "Won't do",
    clarify: 'Needs details',
    emergency: 'Emergency',
  },
  clarify: {
    timer_duration: 'needs a duration',
    clock_time: 'clock time (not yet)',
    device_later: 'timed device (not yet)',
    move_failed: "couldn't work out the move",
  },
  walk: {
    forward: 'forward',
    backward: 'backward',
    left: 'left',
    right: 'right',
    to_user: 'come closer',
    home: 'back home',
  },
  turn: { left: 'left', right: 'right', around: 'around', spin: 'full spin' },
  emotion: { happy: 'happy', sad: 'sad', angry: 'angry', surprised: 'surprised' },
  day: { '-1': 'yesterday', '0': 'today', '1': 'tomorrow', '2': 'day after tomorrow' },
  lunar: { date: 'date', year: 'year', tet: 'Tết', ram: 'full moon', mung1: 'new moon' },
  aspect: { general: '', rain: 'rain', temp: 'temperature' },
  intro: { who: 'who', creator: 'creator', age: 'age', project: 'project' },
  smalltalk: {
    how_are_you: 'how are you',
    love: 'love',
    user_sad: "you're sad",
    user_tired: "you're tired",
    user_happy: "you're happy",
  },
  on: 'on',
  off: 'off',
  speed: (n) => `speed ${n}`,
  faster: 'faster',
  slower: 'slower',
  steps: (n) => `${n} steps`,
  langs: { vi: 'Vietnamese', en: 'English' },
}

export const intentDict = { vi, en }

export interface IntentView {
  type: ActionType
  category: ActionCategory
  icon: LucideIcon
  label: string
  /** Extra words, e.g. "sang trái", "Huế", "5 + 3 = 8". */
  detail?: string
  /** Shown as "×3" when > 1. */
  count?: number
}

const dayKey = (d: DayOffset) => String(d) as keyof typeof vi.day

/** How one parsed action reads in the UI. */
export function describeAction(action: Action, lang: Lang, fmt: Fmt): IntentView {
  const t = intentDict[lang]
  const base = {
    type: action.type,
    category: actionCategory(action.type),
    icon: ACTION_ICONS[action.type],
    label: t.labels[action.type],
  }
  const join = (...parts: (string | undefined | false)[]) => parts.filter(Boolean).join(' · ') || undefined

  switch (action.type) {
    case 'jump':
    case 'wave':
    case 'nod':
    case 'shake_head':
    case 'thumbs_up':
    case 'punch':
      return { ...base, count: action.count }
    case 'dance':
    case 'run':
      return { ...base, detail: action.seconds ? formatDuration(action.seconds, lang, fmt) : undefined }
    case 'walk':
      return { ...base, detail: join(t.walk[action.direction], action.steps > 1 && t.steps(action.steps)) }
    case 'turn':
      return { ...base, detail: t.turn[action.direction], count: action.count }
    case 'emote':
      return { ...base, icon: EMOTION_ICONS[action.emotion] ?? base.icon, detail: t.emotion[action.emotion] }
    case 'custom_move': {
      // The (filtered) name Qwen gave the move, e.g. "Moonwalk"; the generic label otherwise.
      const name = action.move.name?.[lang]
      return { ...base, ...(name ? { label: name } : {}), count: action.count }
    }
    case 'date':
    case 'weekday':
      return { ...base, detail: t.day[dayKey(action.dayOffset)] }
    case 'lunar':
      return {
        ...base,
        detail: join(t.lunar[action.query], action.dayOffset !== 0 && t.day[dayKey(action.dayOffset)]),
      }
    case 'timer_start':
      return { ...base, detail: join(formatDuration(action.seconds, lang, fmt), action.label) }
    case 'weather':
      return {
        ...base,
        detail: join(
          (action.place ?? DEFAULT_PLACE).name[lang],
          action.dayOffset !== 0 && t.day[dayKey(action.dayOffset)],
          t.aspect[action.aspect],
        ),
      }
    case 'math':
      return {
        ...base,
        detail:
          action.result === null
            ? formatMathExpr(action.expr, fmt)
            : `${formatMathExpr(action.expr, fmt)} = ${fmt.numFlex(action.result)}`,
      }
    case 'intro':
      return { ...base, detail: t.intro[action.topic] }
    case 'smalltalk':
      return { ...base, detail: t.smalltalk[action.topic] }
    case 'voice':
      return { ...base, detail: action.on ? t.on : t.off }
    case 'set_language':
      return { ...base, detail: t.langs[action.lang] }
    case 'light':
      return {
        ...base,
        detail: join(
          action.power === 'off' ? t.off : action.power === 'on' || action.color ? t.on : undefined,
          action.color && LIGHT_COLORS[action.color].name[lang],
        ),
      }
    case 'fan':
      return {
        ...base,
        detail: join(
          action.power === 'off' ? t.off : action.power === 'on' ? t.on : undefined,
          action.speed !== undefined && t.speed(action.speed),
          action.speedDelta === 1 && t.faster,
          action.speedDelta === -1 && t.slower,
        ),
      }
    case 'unsupported':
      return { ...base, detail: join(action.verb[lang], action.object?.[lang]) }
    case 'ack_negation':
      return { ...base, detail: t.labels[action.target] }
    case 'clarify':
      return { ...base, detail: join(t.clarify[action.need], action.label) }
    default:
      return base
  }
}
