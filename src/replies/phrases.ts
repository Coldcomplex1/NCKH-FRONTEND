import type { Action, ActionType } from '@/core/actions'
import type { Lang } from '@/core/lang'
import type { Fmt } from '@/i18n/format'
import { safePhrase } from './shared'

/** Bare verb phrase per action type, for "mình sẽ không {verb}" / "But I can {verb}!". */
export const ACTION_VERB: Record<Lang, Record<ActionType, string>> = {
  vi: {
    jump: 'nhảy',
    dance: 'nhảy múa',
    wave: 'vẫy tay',
    nod: 'gật đầu',
    shake_head: 'lắc đầu',
    thumbs_up: 'giơ ngón cái',
    punch: 'đấm',
    walk: 'đi lại',
    run: 'chạy',
    turn: 'xoay người',
    sit: 'ngồi xuống',
    stand: 'đứng dậy',
    sleep: 'đi ngủ',
    wake: 'thức dậy',
    fall: 'giả vờ ngã',
    emote: 'làm mặt cười',
    stop: 'dừng lại',
    custom_move: 'làm động tác mới',
    time: 'xem giờ',
    date: 'xem ngày',
    weekday: 'xem thứ',
    lunar: 'xem lịch âm',
    timer_start: 'hẹn giờ',
    timer_cancel: 'hủy hẹn giờ',
    timer_status: 'xem hẹn giờ',
    weather: 'xem thời tiết',
    math: 'làm toán',
    greet: 'chào hỏi',
    thanks: 'cảm ơn',
    goodbye: 'chào tạm biệt',
    praise: 'khen',
    insult: 'chê',
    intro: 'giới thiệu bản thân',
    capabilities: 'kể những việc mình làm được',
    joke: 'kể chuyện cười',
    smalltalk: 'trò chuyện',
    voice: 'đổi chế độ giọng nói',
    set_language: 'đổi ngôn ngữ',
    light: 'động vào đèn',
    fan: 'động vào quạt',
    unsupported: 'làm việc đó',
    ack_negation: 'làm việc đó',
    clarify: 'hỏi thêm',
    emergency: 'gọi người giúp',
  },
  en: {
    jump: 'jump',
    dance: 'dance',
    wave: 'wave',
    nod: 'nod',
    shake_head: 'shake my head',
    thumbs_up: 'give a thumbs up',
    punch: 'punch',
    walk: 'walk around',
    run: 'run',
    turn: 'turn around',
    sit: 'sit down',
    stand: 'stand up',
    sleep: 'go to sleep',
    wake: 'wake up',
    fall: 'play dead',
    emote: 'make a funny face',
    stop: 'stop',
    custom_move: 'do a new move',
    time: 'tell the time',
    date: 'tell the date',
    weekday: 'tell the day of the week',
    lunar: 'check the lunar calendar',
    timer_start: 'set a timer',
    timer_cancel: 'cancel the timer',
    timer_status: 'check the timer',
    weather: 'check the weather',
    math: 'do the math',
    greet: 'say hello',
    thanks: 'say thanks',
    goodbye: 'say goodbye',
    praise: 'give compliments',
    insult: 'complain',
    intro: 'introduce myself',
    capabilities: 'list what I can do',
    joke: 'tell a joke',
    smalltalk: 'chat',
    voice: 'change the voice setting',
    set_language: 'switch languages',
    light: 'touch the light',
    fan: 'touch the fan',
    unsupported: 'do that',
    ack_negation: 'do that',
    clarify: 'ask for details',
    emergency: 'call for help',
  },
}

const times = (n: number) => n > 1

/** "Lộn nhào" → "lộn nhào" inside a sentence; leaves "MJ moonwalk" (an acronym) alone. */
function lowerFirst(s: string, lang: Lang): string {
  const second = s.charAt(1)
  if (second && second === second.toLocaleUpperCase(lang === 'vi' ? 'vi-VN' : 'en-US')) return s
  return s.charAt(0).toLocaleLowerCase(lang === 'vi' ? 'vi-VN' : 'en-US') + s.slice(1)
}

/** Short phrase for one step of a motion chain: VI "nhảy 3 lần", EN "jumping 3 times". */
export function chainPhrase(a: Action, lang: Lang, fmt: Fmt): string {
  const n = (x: number) => fmt.int(x)
  if (lang === 'vi') {
    switch (a.type) {
      case 'jump':
        return times(a.count) ? `nhảy ${n(a.count)} lần` : 'nhảy'
      case 'dance':
        return 'nhảy múa'
      case 'wave':
        return times(a.count) ? `vẫy tay ${n(a.count)} lần` : 'vẫy tay'
      case 'nod':
        return times(a.count) ? `gật đầu ${n(a.count)} lần` : 'gật đầu'
      case 'shake_head':
        return times(a.count) ? `lắc đầu ${n(a.count)} lần` : 'lắc đầu'
      case 'thumbs_up':
        return times(a.count) ? `giơ ngón cái ${n(a.count)} lần` : 'giơ ngón cái'
      case 'punch':
        return times(a.count) ? `đấm ${n(a.count)} cú` : 'tung một cú đấm'
      case 'walk':
        switch (a.direction) {
          case 'forward':
            return `đi tới ${n(a.steps)} bước`
          case 'backward':
            return `lùi ${n(a.steps)} bước`
          case 'left':
            return `đi sang trái ${n(a.steps)} bước`
          case 'right':
            return `đi sang phải ${n(a.steps)} bước`
          case 'to_user':
            return 'lại chỗ bạn'
          case 'home':
            return 'về chỗ cũ'
        }
        return 'đi'
      case 'run':
        return 'chạy'
      case 'turn':
        switch (a.direction) {
          case 'left':
            return 'quay sang trái'
          case 'right':
            return 'quay sang phải'
          case 'around':
            return 'quay ra sau'
          case 'spin':
            return times(a.count) ? `xoay ${n(a.count)} vòng` : 'xoay một vòng'
        }
        return 'quay'
      case 'sit':
        return 'ngồi xuống'
      case 'stand':
        return 'đứng dậy'
      case 'sleep':
        return 'đi ngủ'
      case 'wake':
        return 'thức dậy'
      case 'fall':
        return 'giả vờ ngã'
      case 'emote':
        return {
          happy: 'cười thật tươi',
          sad: 'làm mặt buồn',
          angry: 'làm mặt giận',
          surprised: 'làm mặt ngạc nhiên',
        }[a.emotion]
      case 'stop':
        return 'dừng lại'
      case 'custom_move': {
        const name = safePhrase(a.move.name?.vi)
        const what = name ? lowerFirst(name, 'vi') : 'làm động tác mới'
        return times(a.count) ? `${what} ${n(a.count)} lần` : what
      }
      default:
        return ACTION_VERB.vi[a.type]
    }
  }
  switch (a.type) {
    case 'jump':
      return times(a.count) ? `jumping ${n(a.count)} times` : 'jumping'
    case 'dance':
      return 'dancing'
    case 'wave':
      return times(a.count) ? `waving ${n(a.count)} times` : 'waving'
    case 'nod':
      return times(a.count) ? `nodding ${n(a.count)} times` : 'nodding'
    case 'shake_head':
      return times(a.count) ? `shaking my head ${n(a.count)} times` : 'shaking my head'
    case 'thumbs_up':
      return times(a.count) ? `giving ${n(a.count)} thumbs up` : 'giving a thumbs up'
    case 'punch':
      return times(a.count) ? `throwing ${n(a.count)} punches` : 'throwing a punch'
    case 'walk': {
      const steps = a.steps === 1 ? 'one step' : `${n(a.steps)} steps`
      switch (a.direction) {
        case 'forward':
          return `walking ${steps} forward`
        case 'backward':
          return `stepping back ${steps}`
        case 'left':
          return `walking ${steps} left`
        case 'right':
          return `walking ${steps} right`
        case 'to_user':
          return 'coming over to you'
        case 'home':
          return 'going back to my spot'
      }
      return 'walking'
    }
    case 'run':
      return 'running'
    case 'turn':
      switch (a.direction) {
        case 'left':
          return 'turning left'
        case 'right':
          return 'turning right'
        case 'around':
          return 'turning around'
        case 'spin':
          return times(a.count) ? `spinning ${n(a.count)} times` : 'spinning around'
      }
      return 'turning'
    case 'sit':
      return 'sitting down'
    case 'stand':
      return 'standing up'
    case 'sleep':
      return 'going to sleep'
    case 'wake':
      return 'waking up'
    case 'fall':
      return 'playing dead'
    case 'emote':
      return {
        happy: 'smiling big',
        sad: 'looking sad',
        angry: 'looking grumpy',
        surprised: 'looking surprised',
      }[a.emotion]
    case 'stop':
      return 'stopping'
    case 'custom_move': {
      const name = safePhrase(a.move.name?.en)
      const what = name ? `doing the ${lowerFirst(name, 'en')}` : 'doing a new move'
      return times(a.count) ? `${what} ${n(a.count)} times` : what
    }
    default:
      return ACTION_VERB.en[a.type]
  }
}
