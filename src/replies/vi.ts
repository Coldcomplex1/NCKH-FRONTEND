/**
 * Vietnamese reply templates. Register: casual "mình / bạn", warm and short (many users are elderly),
 * no "Dạ… ạ", no emoji, "độ C" instead of "°C".
 */
import type { MathToken } from '@/core/actions'
import { LIGHT_COLORS } from '@/core/colors'
import { describeWeatherCode } from '@/core/wmo'
import { project } from '@/content/project'
import { ENV } from '@/lib/env'
import type { Fmt } from '@/i18n/format'
import { ZODIAC } from '@/lib/calendar/lunar'
import { partOfDay, vnParts } from '@/lib/vnTime'
import {
  calDate,
  lunarDayFacts,
  lunarYearFacts,
  nextLunarDay,
  nextLunarDayOfMonth,
  tetFacts,
  type CalDate,
} from './calendar'
import { jokeAt } from './jokes'
import { ACTION_VERB, chainPhrase } from './phrases'
import {
  COLD_C,
  HOT_C,
  capFirst,
  forecastDay,
  isRainCode,
  joinList,
  rainLevel,
  safeList,
  safePhrase,
} from './shared'
import type { Templates } from './types'

const BOT = project.botName
const TEAM = project.team

export const WEEKDAY_VI = [
  'Chủ nhật',
  'thứ Hai',
  'thứ Ba',
  'thứ Tư',
  'thứ Năm',
  'thứ Sáu',
  'thứ Bảy',
] as const
const DAY_PREFIX: Record<number, string> = { [-1]: 'Hôm qua', 0: 'Hôm nay', 1: 'Ngày mai', 2: 'Ngày kia' }
const dayPrefix = (offset: number) => DAY_PREFIX[offset] ?? 'Hôm nay'

/** "thứ Bảy, ngày 6 tháng 2 năm 2027" (plain digits: years must not get a grouping dot). */
function solarDate(d: CalDate): string {
  return `${WEEKDAY_VI[d.weekday]}, ngày ${d.day} tháng ${d.month} năm ${d.year}`
}

export function lunarDayWord(day: number): string {
  if (day <= 10) return `mùng ${day}`
  if (day === 15) return 'ngày rằm'
  return `ngày ${day}`
}

export function lunarMonthWord(month: number, leap: boolean): string {
  const name = month === 1 ? 'tháng Giêng' : month === 12 ? 'tháng Chạp' : `tháng ${month}`
  return leap ? `${name} nhuận` : name
}

/** Part of day for clock times: 0 h is "đêm", 1–10 "sáng", 11–12 "trưa", 13–17 "chiều", 18–21 "tối". */
export function viClockPart(h: number): string {
  if (h < 1) return 'đêm'
  if (h < 11) return 'sáng'
  if (h < 13) return 'trưa'
  if (h < 18) return 'chiều'
  if (h < 22) return 'tối'
  return 'đêm'
}

export function viTime(h: number, m: number): string {
  const h12 = h % 12 || 12
  const p = viClockPart(h)
  if (m === 0) return `Bây giờ là đúng ${h12} giờ ${p}.`
  if (m === 30) return `Bây giờ là ${h12} giờ rưỡi ${p}.`
  return `Bây giờ là ${h12} giờ ${m} phút ${p}.`
}

/** Signed number in words-friendly form: -3 → "âm 3". */
function num(fmt: Fmt, n: number): string {
  return n < 0 ? `âm ${fmt.numFlex(-n)}` : fmt.numFlex(n)
}

function deg(fmt: Fmt, n: number): string {
  const r = Math.round(n)
  return r < 0 ? `âm ${fmt.int(-r)}` : fmt.int(r)
}

const OP: Record<string, string> = { '+': 'cộng', '-': 'trừ', '*': 'nhân', '/': 'chia' }
function exprWords(fmt: Fmt, expr: MathToken[]): string {
  return expr.map((t) => (typeof t === 'number' ? num(fmt, t) : (OP[t] ?? t))).join(' ')
}

/** 90 → "1 phút 30 giây". */
export function durationVi(fmt: Fmt, seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const parts: string[] = []
  if (h > 0) parts.push(`${fmt.int(h)} giờ`)
  if (m > 0) parts.push(`${fmt.int(m)} phút`)
  if (r > 0 || parts.length === 0) parts.push(`${fmt.int(r)} giây`)
  return parts.join(' ')
}

const q = (s: string) => `“${s}”`

const DAY_WORD_LOWER: Record<number, string> = { 0: 'hôm nay', 1: 'ngày mai', 2: 'ngày kia' }

export const vi: Templates = {
  // ---- motion
  'motion.jump': ({ count }, c) =>
    count > 1
      ? `Mình nhảy ${c.fmt.int(count)} lần nhé!`
      : c.pick(['Hây da! Nhảy nè!', 'Hấp! Mình nhảy lên nè!']),
  'motion.dance': (_, c) => c.pick(['Nhạc lên nào, mình nhảy một bài nhé!', 'Mình nhảy múa cho bạn xem nè!']),
  'motion.wave': ({ count }, c) =>
    count > 1 ? `Mình vẫy tay ${c.fmt.int(count)} lần nè!` : 'Mình vẫy tay chào bạn nè!',
  'motion.nod': ({ count }, c) => (count > 1 ? `Mình gật đầu ${c.fmt.int(count)} lần nè.` : 'Gật gật!'),
  'motion.shake_head': ({ count }, c) =>
    count > 1 ? `Mình lắc đầu ${c.fmt.int(count)} lần nè.` : 'Lắc lắc đầu!',
  'motion.thumbs_up': ({ count }, c) =>
    count > 1 ? `Mình giơ ngón cái ${c.fmt.int(count)} lần luôn!` : 'Tuyệt vời!',
  'motion.punch': ({ count }, c) =>
    count > 1 ? `Hự! Mình tung ${c.fmt.int(count)} cú đấm liên hoàn!` : 'Hự! Cú đấm thần tốc!',
  'motion.walk': ({ direction, steps }, c) => {
    const n = c.fmt.int(steps)
    switch (direction) {
      case 'forward':
        return steps > 1 ? `Mình đi tới ${n} bước.` : 'Mình bước tới một bước.'
      case 'backward':
        return steps > 1 ? `Mình lùi lại ${n} bước nè.` : 'Mình lùi lại một bước nè.'
      case 'left':
        return steps > 1 ? `Mình đi sang trái ${n} bước.` : 'Mình bước sang trái nè.'
      case 'right':
        return steps > 1 ? `Mình đi sang phải ${n} bước.` : 'Mình bước sang phải nè.'
      case 'to_user':
        return 'Mình tới chỗ bạn đây!'
      case 'home':
        return 'Mình về chỗ cũ nè.'
    }
    return 'Mình đi nè.'
  },
  'motion.walk_blocked': () => 'Ối, tới sát tường rồi, mình dừng ở đây nhé.',
  'motion.run': (_, c) => c.pick(['Chạy nào!', 'Mình chạy một vòng nè!']),
  'motion.turn': ({ direction, count }, c) => {
    switch (direction) {
      case 'left':
        return 'Mình quay sang trái.'
      case 'right':
        return 'Mình quay sang phải.'
      case 'around':
        return 'Mình quay lại phía sau.'
      case 'spin':
        return count > 1 ? `Mình xoay ${c.fmt.int(count)} vòng nè!` : 'Xoay một vòng nè!'
    }
    return 'Mình quay nè.'
  },
  'motion.sit': () => 'Mình ngồi nghỉ một chút.',
  'motion.already_sitting': () => 'Mình đang ngồi rồi nè!',
  'motion.stand': () => 'Mình đứng dậy rồi!',
  'motion.already_standing': () => 'Mình đang đứng rồi nè!',
  'motion.sleep': () => 'Chúc ngủ ngon… khò khò.',
  'motion.already_sleeping': () => 'Mình đang ngủ mà… khò khò.',
  'motion.wake': () => 'Mình dậy rồi đây!',
  'motion.already_awake': () => 'Mình đang thức mà!',
  'motion.fall': () => 'Ối! Mình ngã rồi…',
  'motion.fall_recover': () => 'Đùa thôi, mình không sao hết!',
  'motion.emote': ({ emotion }) =>
    ({
      happy: 'Mình vui lắm!',
      sad: 'Mình buồn quá…',
      angry: 'Hừm, mình giận rồi đó!',
      surprised: 'Ôi, bất ngờ quá!',
    })[emotion],
  'motion.stop': () => 'Mình dừng lại rồi.',
  'motion.chain': ({ actions }, c) => {
    const parts = actions.map((a) => chainPhrase(a, 'vi', c.fmt))
    if (parts.length === 0) return 'Được!'
    return `Được! ${capFirst(joinList(parts, 'rồi'))} nè.`
  },
  'motion.custom_move': ({ name, count }, c) => {
    const n = safePhrase(name?.vi)
    if (!n)
      return count > 1
        ? `Xem mình làm ${c.fmt.int(count)} lần nè!`
        : c.pick(['Xem mình làm nè!', 'Được, xem nè!'])
    return count > 1 ? `Xem mình ${n} ${c.fmt.int(count)} lần nè!` : `Xem mình ${n} nè!`
  },

  // ---- AI moves
  'ai.thinking': (_, c) => c.pick(['Để mình nghĩ động tác đã nhé…', 'Hừm, để mình thử nghĩ xem…']),
  'ai.move_failed': () => 'Xin lỗi, mình chưa nghĩ ra động tác này. Bạn thử lại sau nhé!',

  // ---- information
  'info.time': ({ iso }) => {
    const p = vnParts(new Date(iso))
    return viTime(p.hour, p.minute)
  },
  'info.date': ({ iso, dayOffset }) => `${dayPrefix(dayOffset)} là ${solarDate(calDate(iso, dayOffset))}.`,
  'info.weekday': ({ iso, dayOffset }) => {
    const d = calDate(iso, dayOffset)
    return `${dayPrefix(dayOffset)} là ${WEEKDAY_VI[d.weekday]}.`
  },
  'info.lunar': ({ iso, query, dayOffset, yearOffset, month: askedMonth }) => {
    switch (query) {
      case 'date': {
        const f = lunarDayFacts(iso, dayOffset)
        const l = f.lunar
        let s = `${dayPrefix(dayOffset)} là ${lunarDayWord(l.day)} ${lunarMonthWord(l.month, l.leap)} âm lịch, năm ${f.canChi}.`
        if (f.festival) s += ` Đúng ngày ${f.festival.name.vi} luôn đó!`
        else if (f.festivalNext) {
          const next =
            dayOffset === -1
              ? 'Hôm nay'
              : dayOffset === 0
                ? 'Ngày mai'
                : dayOffset === 1
                  ? 'Ngày kia'
                  : 'Hôm sau đó'
          s += ` ${next} là ${f.festivalNext.name.vi} đó!`
        }
        return s
      }
      case 'year': {
        if (yearOffset) {
          const y = lunarYearFacts(iso, yearOffset)
          const which = yearOffset > 0 ? 'Năm sau' : 'Năm ngoái'
          return `${which} là năm ${y.canChi}, năm con ${ZODIAC.vi[y.zodiac]}.`
        }
        const f = lunarDayFacts(iso, 0)
        const animal = ZODIAC.vi[f.zodiac]
        return f.lunarYearLags
          ? `Theo âm lịch, bây giờ vẫn là năm ${f.canChi}, năm con ${animal}.`
          : `Năm nay là năm ${f.canChi}, năm con ${animal}.`
      }
      case 'tet': {
        const t = tetFacts(iso)
        if (t.kind === 'during') return `Hôm nay là mùng ${t.day} Tết! Chúc mừng năm mới!`
        if (t.days === 1) return `Ngày mai là Tết ${t.canChi} rồi, ${solarDate(t.solar)}!`
        return `Còn ${t.days} ngày nữa là đến Tết ${t.canChi}, rơi vào ${solarDate(t.solar)}.`
      }
      case 'ram':
      case 'mung1': {
        const f =
          askedMonth !== undefined
            ? nextLunarDayOfMonth(iso, query === 'ram' ? 15 : 1, askedMonth)
            : nextLunarDay(iso, query === 'ram' ? 15 : 1)
        const month = lunarMonthWord(f.lunar.month, f.lunar.leap)
        const name = query === 'ram' ? `Rằm ${month}` : `Mùng 1 ${month}`
        const fest = f.festival ? ` Đó cũng là ${f.festival.name.vi}.` : ''
        if (f.days === 0)
          return `Hôm nay là ${query === 'ram' ? 'rằm' : 'mùng 1'} ${month} âm lịch đó!${fest}`
        const when = f.days === 1 ? 'là ngày mai đó' : `còn ${f.days} ngày nữa`
        return `${name} âm lịch rơi vào ${solarDate(f.solar)}, ${when}.${fest}`
      }
    }
    return 'Xin lỗi, mình chưa xem được lịch âm lúc này.'
  },
  'info.weather': ({ place, dayOffset, aspect, data }, c) => {
    const f = c.fmt
    const where = place.vi
    const cur = data.current
    const day = forecastDay(data, dayOffset)
    const today = dayOffset === 0
    const hot = (t: number) => (t >= HOT_C ? ' Trời nóng lắm, nhớ uống đủ nước nhé!' : '')
    const cold = (t: number) => (t <= COLD_C ? ' Trời lạnh, nhớ mặc ấm nhé!' : '')
    if (!today && !day) return `Xin lỗi, mình chưa có dự báo ${DAY_WORD_LOWER[dayOffset]} ở ${where}.`

    if (aspect === 'rain') {
      if (today && isRainCode(cur.code)) {
        return `Bây giờ ở ${where} ${describeWeatherCode(cur.code).text.vi}. Bạn nhớ mang ô nhé!`
      }
      const prefix = `${dayPrefix(dayOffset)} ở ${where}`
      const p = day?.precipProbability ?? null
      if (p === null) {
        const code = day?.code ?? cur.code
        return isRainCode(code)
          ? `${prefix} ${describeWeatherCode(code).text.vi}. Bạn nhớ mang ô nhé!`
          : `${prefix} ${describeWeatherCode(code).text.vi}, chắc không mưa đâu.`
      }
      const pct = `${f.int(p)}%`
      switch (rainLevel(p)) {
        case 'likely':
          return `${prefix} nhiều khả năng có mưa (${pct}). Bạn nhớ mang ô nhé!`
        case 'possible':
          return `${prefix} có thể có mưa (${pct}). Bạn mang theo ô cho chắc nhé.`
        case 'unlikely':
          return `${prefix} ít khả năng mưa (${pct}).`
      }
    }

    if (aspect === 'temp') {
      if (today) {
        const extra = hot(cur.tempC) || cold(cur.tempC)
        return `Ở ${where} đang ${deg(f, cur.tempC)} độ C, cảm giác như ${deg(f, cur.feelsLikeC)} độ.${extra}`
      }
      const d = day!
      const extra = hot(d.maxC) || cold(d.minC)
      return `${dayPrefix(dayOffset)} ở ${where} nhiệt độ từ ${deg(f, d.minC)} đến ${deg(f, d.maxC)} độ C.${extra}`
    }

    // general
    if (today) {
      const desc = describeWeatherCode(cur.code).text.vi
      const p = day?.precipProbability ?? null
      const rain =
        p !== null && p >= 60 && !isRainCode(cur.code) ? ' Hôm nay dễ có mưa, bạn nhớ mang ô nhé!' : ''
      const umbrella = isRainCode(cur.code) ? ' Bạn nhớ mang ô nhé!' : ''
      const extra = hot(cur.tempC) || cold(cur.tempC)
      return `Bây giờ ở ${where} ${desc}, ${deg(f, cur.tempC)} độ C, độ ẩm ${f.int(cur.humidity)}%, gió ${f.int(cur.windKmh)} km/h.${rain}${umbrella}${extra}`
    }
    const d = day!
    const desc = describeWeatherCode(d.code).text.vi
    const p = d.precipProbability
    const chance = p === null ? '' : `, khả năng mưa ${f.int(p)}%`
    const rain = p !== null && p >= 60 ? ' Bạn nhớ mang ô nhé!' : ''
    const extra = hot(d.maxC) || cold(d.minC)
    return `${dayPrefix(dayOffset)} ở ${where} ${desc}, nhiệt độ từ ${deg(f, d.minC)} đến ${deg(f, d.maxC)} độ C${chance}.${rain}${extra}`
  },
  'info.weather_error': ({ place, reason }) => {
    const why = {
      offline: 'vì máy đang mất kết nối mạng',
      timeout: 'vì mạng chậm quá',
      http: 'vì dịch vụ thời tiết đang trục trặc',
    }[reason]
    return `Xin lỗi, mình chưa xem được thời tiết ở ${place.vi} ${why}. Bạn thử lại sau nhé.`
  },
  // never echoes the unknown name: the parser only knows that a place was named
  'info.weather_unknown_place': ({ place }) =>
    `Mình chưa biết nơi đó nên xem thời tiết ${place.vi} cho bạn nhé.`,
  'info.math': ({ expr, result }, c) => {
    const approx = Math.abs(result * 1e4 - Math.round(result * 1e4)) > 1e-6
    return `${capFirst(exprWords(c.fmt, expr))} bằng ${approx ? 'khoảng ' : ''}${num(c.fmt, result)}.`
  },
  'info.math_error': ({ error }) =>
    error === 'div0' ? 'Ôi, không chia cho 0 được đâu bạn!' : 'Số lớn quá, mình tính không nổi rồi!',

  // ---- timers
  'timer.start': ({ seconds, label }, c) => {
    const dur = durationVi(c.fmt, seconds)
    const l = safePhrase(label)
    return l
      ? `Được rồi, ${dur} nữa mình sẽ nhắc bạn ${q(l)} nhé!`
      : `Mình đã hẹn giờ ${dur}. Hết giờ mình sẽ báo bạn nhé!`
  },
  'timer.done': ({ label }) => {
    const l = safePhrase(label)
    return l ? `Reng reng! Đến giờ ${q(l)} rồi đó!` : 'Reng reng! Hết giờ rồi bạn ơi!'
  },
  'timer.cancel': ({ label }) => {
    const l = safePhrase(label)
    return l ? `Mình đã hủy nhắc ${q(l)} rồi nhé.` : 'Mình đã hủy hẹn giờ rồi nhé.'
  },
  'timer.none': ({ label }) => {
    const l = safePhrase(label)
    return l ? `Hiện không có nhắc ${q(l)} nào đang chạy.` : 'Hiện không có hẹn giờ nào đang chạy.'
  },
  // (engine) the alarm of a ringing timer was dismissed
  'timer.dismissed': () => 'Đã tắt chuông.',
  'timer.status': ({ remainingSec, label }, c) => {
    const l = safePhrase(label)
    if (remainingSec < 1) return 'Sắp hết giờ rồi đó!'
    const dur = durationVi(c.fmt, Math.ceil(remainingSec))
    return l ? `Còn ${dur} nữa là đến giờ ${q(l)}.` : `Còn ${dur} nữa là hết giờ.`
  },
  'timer.limit': ({ max }, c) =>
    `Mình chỉ giữ được tối đa ${c.fmt.int(max)} hẹn giờ cùng lúc thôi. Bạn hủy bớt một cái nhé.`,
  'timer.ask': ({ label }) =>
    `Bạn muốn mình nhắc sau bao lâu? Ví dụ: ${q(`nhắc tôi ${safePhrase(label) ?? 'uống thuốc'} sau 15 phút`)}.`,
  'timer.clock_time': () => `Mình chưa hẹn theo giờ đồng hồ được. Bạn nói ${q('sau 30 phút')} giúp mình nhé.`,

  // ---- conversation
  'chat.greet': ({ iso }, c) => {
    const hello = {
      morning: 'Chào buổi sáng!',
      noon: 'Chào buổi trưa!',
      afternoon: 'Chào buổi chiều!',
      evening: 'Chào buổi tối!',
      night: 'Chào bạn, khuya rồi đó!',
    }[partOfDay(vnParts(new Date(iso)).hour)]
    return c.pick([
      `${hello} Mình là ${BOT}, bạn cần mình giúp gì nào?`,
      `${hello} Rất vui được gặp bạn. Mình giúp gì được cho bạn?`,
    ])
  },
  'chat.thanks': (_, c) =>
    c.pick(['Không có chi! Rất vui được giúp bạn.', 'Có gì đâu, bạn cần gì cứ nói mình nhé!']),
  'chat.goodbye': (_, c) =>
    c.pick(['Tạm biệt, hẹn gặp lại bạn nhé!', 'Tạm biệt bạn, chúc bạn một ngày vui!']),
  'chat.praise': (_, c) =>
    c.pick(['Cảm ơn bạn nhiều nha! Mình vui lắm.', 'Bạn khen làm mình ngại quá, cảm ơn bạn!']),
  'chat.insult': () => 'Mình sẽ cố gắng hơn, bạn đừng buồn nhé.',
  'chat.intro': ({ topic, wer }, c) => {
    switch (topic) {
      case 'who':
        return `Mình là ${BOT}, rô-bốt trợ lý của nhóm nghiên cứu ${TEAM}. Mình hiểu lệnh tiếng Việt của cả ba miền đó!`
      case 'creator':
        return `Mình được nhóm học sinh ${TEAM} tạo ra, dưới sự hướng dẫn của ${project.mentor.name.vi}.`
      case 'age':
        return 'Mình còn nhỏ lắm, mới ra đời thôi!'
      case 'project': {
        const werPart =
          wer !== undefined && Number.isFinite(wer)
            ? `, với tỉ lệ lỗi từ (WER) khoảng ${c.fmt.pct(wer, 1)} trên tập kiểm tra`
            : ''
        return ENV.asr.enabled
          ? `Mình nghe giọng nói nhờ mô hình PhoWhisper-large tinh chỉnh trên bộ dữ liệu ViMD${werPart}. Bạn gõ lệnh cũng được nhé.`
          : `Bây giờ mình đọc lệnh bạn gõ. Sắp tới mình sẽ nghe được giọng nói nhờ mô hình PhoWhisper-large tinh chỉnh trên bộ dữ liệu ViMD${werPart}.`
      }
    }
    return `Mình là ${BOT}.`
  },
  'chat.capabilities': () =>
    'Mình có thể nhảy, múa, vẫy tay, đi lại, xem giờ, xem lịch âm, hẹn giờ, xem thời tiết, làm toán, kể chuyện cười, và bật tắt đèn, quạt trong phòng. Bạn thử gõ “nhảy ba lần” nhé!',
  'chat.joke': ({ index }) => jokeAt(index).vi,
  'chat.smalltalk': ({ topic }) =>
    ({
      how_are_you: 'Mình khỏe lắm, cảm ơn bạn! Còn bạn thì sao?',
      love: 'Mình cũng quý bạn lắm!',
      user_sad: 'Đừng buồn nha, để mình kể chuyện vui cho bạn nghe nhé?',
      user_tired: 'Bạn nghỉ ngơi một chút, uống ly nước cho khỏe nhé!',
      user_happy: 'Bạn vui là mình cũng vui lây nè!',
    })[topic],
  'chat.emergency': () => ({
    text: 'Mình chỉ là robot trình diễn nên không gọi giúp được. Nếu khẩn cấp, bạn hãy gọi 115 hoặc người thân ngay nhé.',
    speech:
      'Mình chỉ là robot trình diễn nên không gọi giúp được. Nếu khẩn cấp, bạn hãy gọi một một năm hoặc người thân ngay nhé.',
  }),
  'pref.voice': ({ on }) =>
    on ? 'Mình nói lại được rồi nè!' : 'Được rồi, mình sẽ im lặng. Bạn vẫn đọc được chữ của mình nhé.',
  'pref.language': ({ lang }) =>
    lang === 'vi' ? 'Được rồi, mình nói tiếng Việt nhé!' : 'Được rồi, mình chuyển sang tiếng Anh nhé!',

  // ---- smart home
  'home.light_on': ({ color }) =>
    color ? `Mình bật đèn màu ${LIGHT_COLORS[color].name.vi} rồi nè.` : 'Mình bật đèn rồi nè.',
  'home.light_off': () => 'Mình tắt đèn rồi.',
  'home.light_color': ({ color }) => `Đèn đã chuyển sang màu ${LIGHT_COLORS[color].name.vi} rồi nè.`,
  'home.light_already': ({ on }) => (on ? 'Đèn đang bật sẵn rồi mà!' : 'Đèn đang tắt sẵn rồi mà.'),
  'home.xanh_ambiguous': () => 'Mình để màu xanh ngọc trước nhé. Bạn muốn xanh lá hay xanh dương?',
  'home.black_is_off': () => 'Đèn màu đen thì… chính là tắt đèn đó!',
  'home.fan_on': ({ speed }) => `Mình bật quạt số ${speed} rồi nè.`,
  'home.fan_off': () => 'Mình tắt quạt rồi.',
  'home.fan_speed': ({ speed, delta }) =>
    delta === 1
      ? `Quạt mạnh hơn rồi, giờ là số ${speed}.`
      : delta === -1
        ? `Quạt nhẹ lại rồi, giờ là số ${speed}.`
        : `Quạt chuyển sang số ${speed} rồi nè.`,
  'home.fan_already': ({ on }) => (on ? 'Quạt đang chạy sẵn rồi mà!' : 'Quạt đang tắt sẵn rồi mà.'),
  'home.fan_speed_limit': ({ speed }) =>
    speed >= 3
      ? `Quạt đang ở số ${speed}, mạnh nhất rồi đó!`
      : speed <= 1
        ? `Quạt đang ở số ${speed}, nhẹ nhất rồi đó!`
        : `Quạt đang ở số ${speed} rồi.`,
  'home.later': ({ device, power }) =>
    `Mình chưa hẹn giờ cho đèn quạt được. Khi cần, bạn cứ nói ${q(`${power === 'off' ? 'tắt' : 'bật'} ${device === 'fan' ? 'quạt' : 'đèn'}`)} nhé.`,

  // ---- meta
  unsupported: ({ reason, verb, object, alternative }) => {
    const what = object ? `${verb.vi} ${object.vi}` : verb.vi
    const alt = alternative ? ` Nhưng mình có thể ${ACTION_VERB.vi[alternative]} nè!` : ''
    switch (reason) {
      case 'physical':
        return `Xin lỗi, mình là robot nên không thể ${what} được.${alt}`
      case 'device_absent':
        return `Xin lỗi, phòng mình không có ${object ? object.vi : 'thiết bị đó'} nên mình không ${verb.vi} được.${alt}`
      case 'out_of_scope':
        return `Xin lỗi, mình chưa biết ${what}.${alt}`
      case 'unsafe':
        return `Xin lỗi, việc đó không an toàn nên mình không làm đâu.${alt}`
    }
    return `Xin lỗi, mình chưa làm được việc đó.${alt}`
  },
  negation: ({ target, emotion }) =>
    emotion
      ? `Được rồi, mình không ${{ happy: 'cười', sad: 'buồn', angry: 'giận', surprised: 'ngạc nhiên' }[emotion]} nữa đâu.`
      : `Được rồi, mình sẽ không ${ACTION_VERB.vi[target]} đâu.`,
  unknown: ({ suggestions }, c) => {
    const s = safeList(suggestions, 3).map(q)
    const sorry = c.pick(['Xin lỗi, mình chưa hiểu ý bạn.', 'Ôi, câu này mình chưa hiểu.'])
    if (s.length === 0) return `${sorry} Bạn nói lại theo cách khác được không?`
    return `${sorry} Bạn thử nói ${joinList(s, 'hoặc')} nhé.`
  },
  partial_unknown: () => 'Còn một phần mình chưa hiểu, bạn nói lại phần đó giúp mình nhé.',
  'note.capped': ({ max, caps }, c) => {
    // (engine) one phrase per capped action, in its own unit: lần / bước / vòng / giây
    const n = (x: number) => c.fmt.int(x)
    if (!caps || caps.length === 0) return `Mình làm tối đa ${n(max)} lần thôi nhé.`
    const parts = caps.map((cap) => {
      switch (cap.unit) {
        case 'steps':
          return `đi tối đa ${n(cap.max)} bước`
        case 'spins':
          return `xoay tối đa ${n(cap.max)} vòng`
        case 'seconds':
          return `${ACTION_VERB.vi[cap.action]} tối đa ${n(cap.max)} giây`
        case 'times':
          return `${ACTION_VERB.vi[cap.action]} tối đa ${n(cap.max)} lần`
      }
      return `làm tối đa ${n(cap.max)} lần`
    })
    return `Mình ${joinList(parts, 'và')} thôi nhé.`
  },
  'note.nothing_to_repeat': () => 'Mình chưa làm gì để lặp lại cả. Bạn thử bảo mình nhảy xem!',
  'note.too_many_actions': ({ max }, c) =>
    `Mỗi lần mình chỉ làm được ${c.fmt.int(max)} việc thôi, phần còn lại bạn nói sau nhé.`,
  welcome: ({ layout }) =>
    `Xin chào, mình là ${BOT}! Bạn gõ lệnh ở ô ${layout === 'side' ? 'bên phải' : 'bên dưới'} để mình làm theo nhé, ví dụ “nhảy lên”.`,
  'robot.not_ready': () => 'Mình đang khởi động, bạn chờ một chút nhé.',
  'asr.empty': () => 'Mình chưa nghe thấy gì cả. Bạn nói to và rõ hơn một chút nhé.',
  'asr.error': ({ kind }) =>
    ({
      network: 'Xin lỗi, mình không kết nối được máy nhận giọng nói. Bạn kiểm tra mạng rồi thử lại nhé.',
      timeout: 'Xin lỗi, máy nhận giọng nói phản hồi chậm quá. Bạn thử lại nhé.',
      too_large: 'Xin lỗi, đoạn ghi âm dài quá. Bạn thử ghi ngắn hơn nhé.',
      unsupported_media: 'Xin lỗi, mình không đọc được định dạng tệp này. Bạn thử tệp WAV hoặc MP3 nhé.',
      unprocessable: 'Xin lỗi, mình không xử lý được đoạn âm thanh này. Bạn thử ghi lại nhé.',
      busy: 'Xin lỗi, máy nhận giọng nói đang bận. Bạn chờ một chút rồi thử lại nhé.',
      http: 'Xin lỗi, máy nhận giọng nói đang trục trặc. Bạn thử lại sau nhé.',
      bad_response: 'Xin lỗi, mình nhận được kết quả lạ từ máy nhận giọng nói. Bạn thử lại nhé.',
    })[kind],
  'error.generic': () => 'Xin lỗi, có lỗi gì đó rồi. Bạn thử lại nhé.',
}
