import type { Action, TurnDirection, WalkDirection } from '@/core/actions'
import type { ColorId } from '@/core/colors'
import type { NoteKind } from '@/core/parser'
import type { FanSpeed } from '@/core/room'
import type { CtxPatch } from './ctx'

/**
 * Table-driven parser cases, adapted from spec §10 to the core Action union and the v1 scope cuts
 * (no rainbow/blink/brightness, no propose/"ừ" confirm flow, walk left/right is one walk action).
 * Weather places are compared by gazetteer id.
 */
export type Expected =
  | Exclude<Action, { type: 'weather' }>
  | { type: 'weather'; place: string | null; dayOffset: 0 | 1 | 2; aspect: 'general' | 'rain' | 'temp' }

export interface Case {
  in: string
  out: Expected[]
  ctx?: CtxPatch
  /** Nothing (or not everything) was understood: `unknown` must be non-empty. */
  unknown?: boolean
  /** Exact set of note kinds (default: none). */
  notes?: NoteKind[]
}

const c = (input: string, out: Expected[], extra: Omit<Case, 'in' | 'out'> = {}): Case => ({
  in: input,
  out,
  ...extra,
})

// ---- action shorthands
const j = (count = 1): Expected => ({ type: 'jump', count })
const dance = (seconds = 6): Expected => ({ type: 'dance', seconds })
const wave = (count = 1): Expected => ({ type: 'wave', count })
const nod = (count = 1): Expected => ({ type: 'nod', count })
const shake = (count = 1): Expected => ({ type: 'shake_head', count })
const thumbs = (count = 1): Expected => ({ type: 'thumbs_up', count })
const punch = (count = 1): Expected => ({ type: 'punch', count })
const walk = (direction: WalkDirection = 'forward', steps = 3): Expected => ({
  type: 'walk',
  direction,
  steps,
})
const run = (seconds = 3): Expected => ({ type: 'run', seconds })
const turn = (direction: TurnDirection, count = 1): Expected => ({ type: 'turn', direction, count })
const sit: Expected = { type: 'sit' }
const stand: Expected = { type: 'stand' }
const sleep: Expected = { type: 'sleep' }
const wake: Expected = { type: 'wake' }
const fall: Expected = { type: 'fall' }
const stop: Expected = { type: 'stop' }
const emote = (emotion: 'happy' | 'sad' | 'angry' | 'surprised'): Expected => ({ type: 'emote', emotion })
const time: Expected = { type: 'time' }
const date = (dayOffset: -1 | 0 | 1 | 2 = 0): Expected => ({ type: 'date', dayOffset })
const weekday = (dayOffset: -1 | 0 | 1 | 2 = 0): Expected => ({ type: 'weekday', dayOffset })
const lunar = (
  query: 'date' | 'year' | 'tet' | 'ram' | 'mung1',
  dayOffset: -1 | 0 | 1 | 2 = 0,
): Expected => ({
  type: 'lunar',
  query,
  dayOffset,
})
const timer = (seconds: number, label?: string): Expected =>
  label ? { type: 'timer_start', seconds, label } : { type: 'timer_start', seconds }
const wx = (
  place: string | null,
  dayOffset: 0 | 1 | 2 = 0,
  aspect: 'general' | 'rain' | 'temp' = 'general',
): Expected => ({
  type: 'weather',
  place,
  dayOffset,
  aspect,
})
const math = (expr: (number | '+' | '-' | '*' | '/')[], result: number): Expected => ({
  type: 'math',
  expr,
  result,
})
const light = (power: 'on' | 'off', color?: ColorId): Expected =>
  color ? { type: 'light', power, color } : { type: 'light', power }
const fan = (f: { power?: 'on' | 'off'; speed?: FanSpeed; speedDelta?: 1 | -1 }): Expected => ({
  type: 'fan',
  ...f,
})
const intro = (topic: 'who' | 'creator' | 'age' | 'project'): Expected => ({ type: 'intro', topic })
const small = (topic: 'how_are_you' | 'love' | 'user_sad' | 'user_tired' | 'user_happy'): Expected => ({
  type: 'smalltalk',
  topic,
})
const not = (target: Action['type']): Expected => ({ type: 'ack_negation', target })
const unsup = (
  reason: 'physical' | 'device_absent' | 'out_of_scope' | 'unsafe',
  verb: [string, string],
  object?: [string, string],
  alternative?: Action,
): Expected => {
  const a: Expected = { type: 'unsupported', reason, verb: { vi: verb[0], en: verb[1] } }
  if (object) a.object = { vi: object[0], en: object[1] }
  if (alternative) a.alternative = alternative
  return a
}
const EAT: [string, string] = ['ăn', 'eat']
const DRINK: [string, string] = ['uống', 'drink']

/** Every example chip in BRIEF.md, exact strings and exact expected actions. */
export const CHIPS: Case[] = [
  // motion
  c('nhảy lên', [j(1)]),
  c('nhảy ba lần rồi vẫy tay', [j(3), wave(1)]),
  c('nhảy múa đi', [dance()]),
  c('quay một vòng', [turn('spin', 1)]),
  c('ngồi xuống', [sit]),
  c('đi sang trái', [walk('left')]),
  // info
  c('mấy giờ rồi?', [time]),
  c('hôm nay thứ mấy?', [weekday(0)]),
  c('hôm nay âm lịch ngày mấy?', [lunar('date')]),
  c('hẹn giờ 1 phút', [timer(60)]),
  c('thời tiết ở Huế thế nào?', [wx('ThuaThienHue')]),
  // chat
  c('xin chào', [{ type: 'greet' }]),
  c('bạn là ai?', [intro('who')]),
  c('bạn làm được gì?', [{ type: 'capabilities' }]),
  c('kể chuyện cười đi', [{ type: 'joke' }]),
  c('5 cộng 3 bằng mấy?', [math([5, '+', 3], 8)]),
  // home
  c('bật đèn', [light('on')]),
  c('đổi đèn sang màu xanh dương', [light('on', 'blue')]),
  c('bật quạt số 3', [fan({ power: 'on', speed: 3 })]),
  c('tắt đèn', [light('off')]),
  // dialect
  c('chừ mấy giờ rồi rứa?', [time]),
  c('mở đèn lên coi', [light('on')]),
  c('bựa ni thứ mấy?', [weekday(0)]),
  c('mi làm được chi?', [{ type: 'capabilities' }]),
  c('quẹo trái', [turn('left')]),
  c('bat quat len', [fan({ power: 'on' })]),
  // limit
  c('ăn một quả chuối', [unsup('physical', EAT, ['chuối', 'a banana'])]),
]

export const MOTION: Case[] = [
  c('nhảy', [j()]),
  c('Nhảy đi!', [j()]),
  c('hãy nhảy 3 lần nhé', [j(3)]),
  c('nhảy ba lần', [j(3)]),
  c('nhảy 3', [j(3)]),
  c('3 lần nhảy', [j(3)]),
  c('nhảy một bài đi bạn', [dance()]),
  c('nhảy đầm', [dance()]),
  c('quẩy lên nào', [dance()]),
  c('nhảy múa 30 giây', [dance(30)]),
  c('nhảy với tôi', [dance()]),
  c('vẫy tay chào mọi người', [wave()]),
  c('gật đầu hai cái', [nod(2)]),
  c('lắc đầu', [shake()]),
  c('giơ ngón cái lên', [thumbs()]),
  c('đấm ba phát', [punch(3)]),
  c('đi tới 3 bước', [walk('forward', 3)]),
  c('đi chơi', [walk()]),
  c('lùi lại hai bước', [walk('backward', 2)]),
  c('lùi', [walk('backward')]),
  c('đi sang phải', [walk('right')]),
  c('đi qua bên trái 2 bước', [walk('left', 2)]),
  c('lại đây', [walk('to_user')]),
  c('đến đây', [walk('to_user')]),
  c('tới đây nào', [walk('to_user')]),
  c('quay lại đây', [walk('to_user')]),
  c('về chỗ cũ', [walk('home')]),
  c('về chỗ đi', [walk('home')]),
  c('chạy nhanh lên', [run()]),
  c('chạy 10 giây', [run(10)]),
  c('quay trái', [turn('left')]),
  c('quay sang phải', [turn('right')]),
  c('quay lại', [turn('around')]),
  c('quay 3 vòng', [turn('spin', 3)]),
  c('quay phải 2 vòng', [turn('spin', 2)]),
  c('vỗ tay', [wave()]),
  c('nằm xuống', [fall]),
  c('xoay tròn', [turn('spin', 1)]),
  c('ngồi xuống', [sit]),
  c('đứng lên', [stand], { ctx: { posture: 'sitting' } }),
  c('đứng', [stop], { ctx: { activity: 'dancing' } }),
  c('dậy đi', [wake], { ctx: { posture: 'sleeping' } }),
  c('dậy', [stand], { ctx: { posture: 'sitting' } }),
  c('đi ngủ thôi', [sleep]),
  c('dừng lại', [stop], { ctx: { activity: 'dancing' } }),
  c('giả chết đi', [fall]),
  c('làm mặt buồn', [emote('sad')]),
  c('ngạc nhiên đi', [emote('surprised')]),
  c('cười lên', [emote('happy')]),
  c('trời ơi nhảy đi', [j()]),
  c('Ronaldo ơi, nhảy đi', [j()]),
  c('Ronaldo ơi nhảy đi', [j()]),
  c('NHẢY BA LẦN RỒI VẪY TAY', [j(3), wave()]),
]

export const INFO: Case[] = [
  c('mấy giờ rồi', [time]),
  c('bây giờ là mấy giờ', [time]),
  c('mấy giờ rồi ?', [time]),
  c('hôm nay ngày mấy', [date(0)]),
  c('hôm nay thứ mấy', [weekday(0)]),
  c('ngày mai thứ mấy', [weekday(1)]),
  c('hôm qua là thứ mấy', [weekday(-1)]),
  c('hôm nay âm lịch là ngày mấy', [lunar('date')]),
  c('hôm nay mùng mấy', [lunar('date')]),
  c('năm nay là năm con gì', [lunar('year')]),
  c('còn bao nhiêu ngày nữa đến tết', [lunar('tet')]),
  c('rằm tháng này là ngày nào', [lunar('ram')]),
  c('mùng 1 tháng sau là ngày nào', [lunar('mung1')]),
  c('hẹn giờ 5 phút', [timer(300)]),
  c('đếm ngược 10 giây', [timer(10)]),
  c('hẹn giờ một phút rưỡi', [timer(90)]),
  c('hẹn giờ 1 phút 30 giây', [timer(90)]),
  c('hẹn giờ nửa tiếng', [timer(1800)]),
  c('nhắc tôi uống thuốc sau 30 phút', [timer(1800, 'uống thuốc')]),
  c('hủy hẹn giờ', [{ type: 'timer_cancel' }], { ctx: { timers: [{ id: 't1', endsAt: 0 }] } }),
  c('hẹn giờ còn bao lâu', [{ type: 'timer_status' }]),
  c('thời tiết hôm nay thế nào', [wx(null)]),
  c('thời tiết ở Huế', [wx('ThuaThienHue')]),
  c('ngày mai ở Đà Nẵng có mưa không', [wx('DaNang', 1, 'rain')]),
  c('trời có nóng không', [wx(null, 0, 'temp')]),
  c('Hà Nội bao nhiêu độ', [wx('HaNoi', 0, 'temp')]),
  c('thời tiết Sài Gòn ngày mai', [wx('HoChiMinh', 1)]),
  c('thời tiết TP.HCM', [wx('HoChiMinh')]),
  c('thời tiết thành phố Hồ Chí Minh', [wx('HoChiMinh')]),
  c('dự báo thời tiết Đà Lạt', [wx('LamDong')]),
  c('thời tiết Vũng Tàu', [wx('VungTau')]),
  c('ngày mốt Cần Thơ có mưa không', [wx('CanTho', 2, 'rain')]),
  c('thời tiết Bà Rịa-Vũng Tàu', [wx('BaRiaVungTau')]),
  c('thời tiết ở thủ đô', [wx('HaNoi')]),
  c('thời tiết Buôn Ma Thuột', [wx('DakLak')]),
  c('thời tiết Long An', [wx('LongAn')]),
]

export const MATH: Case[] = [
  c('5 cộng 3 bằng mấy', [math([5, '+', 3], 8)]),
  c('mười hai nhân ba bằng bao nhiêu', [math([12, '*', 3], 36)]),
  c('100 chia 4', [math([100, '/', 4], 25)]),
  c('7 trừ 10', [math([7, '-', 10], -3)]),
  c('2 cộng 3 nhân 4', [math([2, '+', 3, '*', 4], 14)]),
  c('hai lăm cộng mười lăm bằng bao nhiêu', [math([25, '+', 15], 40)]),
  c('năm cộng năm', [math([5, '+', 5], 10)]),
  c('5 x 3', [math([5, '*', 3], 15)]),
  c('2+3+4', [math([2, '+', 3, '+', 4], 9)]),
  c('2,5 cộng 1', [math([2.5, '+', 1], 3.5)]),
  c('2.5 nhân 2', [math([2.5, '*', 2], 5)]),
  c('1.000 cộng 1', [math([1000, '+', 1], 1001)]),
  c('5 nhân không', [math([5, '*', 0], 0)]),
  c('5 chia 0', [{ type: 'math', expr: [5, '/', 0], result: null, error: 'div0' }]),
]

export const CHAT: Case[] = [
  c('xin chào', [{ type: 'greet' }]),
  c('chào bạn', [{ type: 'greet' }]),
  c('bạn là ai', [intro('who')]),
  c('bạn tên là gì vậy', [intro('who')]),
  c('ai tạo ra bạn', [intro('creator')]),
  c('bạn bao nhiêu tuổi', [intro('age')]),
  c('mô hình của bạn là gì', [intro('project')]),
  c('PhoWhisper là gì', [intro('project')]),
  c('bạn làm được gì', [{ type: 'capabilities' }]),
  c('kể chuyện cười đi', [{ type: 'joke' }]),
  c('cảm ơn nhé', [{ type: 'thanks' }]),
  c('tạm biệt', [{ type: 'goodbye' }]),
  c('giỏi quá', [{ type: 'praise' }]),
  c('đồ ngốc', [{ type: 'insult' }]),
  c('bạn khỏe không', [small('how_are_you')]),
  c('tôi yêu bạn', [small('love')]),
  c('tôi buồn quá', [small('user_sad')]),
  c('tôi mệt quá', [small('user_tired')]),
  c('nói tiếng anh đi', [{ type: 'set_language', lang: 'en' }]),
  c('nói tiếng việt', [{ type: 'set_language', lang: 'vi' }]),
  c('im lặng', [{ type: 'voice', on: false }]),
  c('bật tiếng lên', [{ type: 'voice', on: true }]),
  c('chào robot, bạn tên gì', [{ type: 'greet' }, intro('who')]),
  c('Ronaldo ơi', [{ type: 'greet' }]),
  c('bạn ơi', [{ type: 'greet' }]),
]

export const HOME: Case[] = [
  c('bật đèn', [light('on')]),
  c('Bật Đèn.', [light('on')]),
  c('tắt đèn đi', [light('off')]),
  c('mở đèn lên', [light('on')]),
  c('đổi đèn sang màu đỏ', [light('on', 'red')]),
  c('đèn màu xanh lá', [light('on', 'green')]),
  c('đèn xanh lá cây', [light('on', 'green')]),
  c('đèn xanh lục', [light('on', 'green')]),
  c('đèn màu xanh két', [light('on', 'green')]),
  c('đèn xanh lam', [light('on', 'blue')]),
  c('đèn màu xanh biển', [light('on', 'blue')]),
  c('đèn xanh nước biển', [light('on', 'blue')]),
  c('đèn màu xanh da trời', [light('on', 'blue')]),
  c('đèn xanh trời', [light('on', 'blue')]),
  c('đèn màu xanh ngọc', [light('on', 'teal')]),
  c('đèn xanh lơ', [light('on', 'teal')]),
  c('cho đèn màu xanh', [light('on', 'teal')], { notes: ['xanh_ambiguous'] }),
  c('xanh lá', [light('on', 'green')]),
  c('đèn màu cam', [light('on', 'orange')]),
  c('đèn vàng', [light('on', 'yellow')]),
  c('đèn vàng ấm', [light('on', 'warm')]),
  c('đèn trắng', [light('on', 'white')]),
  c('đèn màu tím', [light('on', 'purple')]),
  c('đèn màu tía', [light('on', 'purple')]),
  c('đèn hồng', [light('on', 'pink')]),
  c('bật đèn màu đen', [light('off')], { notes: ['black_is_off'] }),
  c('đèn màu đen', [light('off')], { notes: ['black_is_off'] }),
  c('bật quạt số 3', [fan({ power: 'on', speed: 3 })]),
  c('quạt số 2', [fan({ power: 'on', speed: 2 })]),
  c('tắt quạt', [fan({ power: 'off' })], { ctx: { fanOn: true } }),
  c('quạt mạnh lên', [fan({ speedDelta: 1 })], { ctx: { fanOn: true } }),
  c('quạt nhẹ lại', [fan({ speedDelta: -1 })], { ctx: { fanOn: true } }),
  c('bật đèn và quạt', [light('on'), fan({ power: 'on' })]),
  c('tắt đèn và quạt', [light('off'), fan({ power: 'off' })]),
  c('bật đèn rồi bật quạt', [light('on'), fan({ power: 'on' })]),
  c('tắt hết', [light('off'), fan({ power: 'off' })]),
  c('quạt quay đi', [fan({ power: 'on' })]),
  c('cho quạt chạy', [fan({ power: 'on' })]),
  c('quạt chạy nhanh lên', [fan({ speedDelta: 1 })], { ctx: { fanOn: true } }),
  c('tắt điện', [light('off')]),
  c('đèn tắt đi', [light('off')]),
  c('tối quá', [light('on')]),
  c('nóng quá', [fan({ power: 'on' })]),
  c('robot ơi bật đèn', [light('on')]),
  c('bật tivi', [unsup('device_absent', ['bật', 'turn on'], ['tivi', 'a TV'])]),
  c('mở cửa sổ', [unsup('device_absent', ['mở', 'open'], ['cửa sổ', 'a window'])]),
]

export const ASCII: Case[] = [
  c('nhay 3 lan', [j(3)]),
  c('nhay mua', [dance()]),
  c('tat den', [light('off')]),
  c('may gio roi', [time]),
  c('bat quat len', [fan({ power: 'on' })]),
  c('hom nay thu may', [weekday(0)]),
  c('ngu di', [sleep]),
  c('dung lai', [stop], { ctx: { activity: 'walking' } }),
  c('troi co mua khong', [wx(null, 0, 'rain')]),
  c('mua chuoi', [unsup('physical', ['mua', 'buy'], ['chuối', 'a banana'])]),
  c('den mau hong', [light('on', 'pink')]),
  c('thoi tiet long an', [wx('LongAn')]),
  c('thoi tiet sai gon', [wx('HoChiMinh')]),
  c('vay tay', [wave()]),
  c('nhay di vay', [j()]),
  c('ban lam duoc gi', [{ type: 'capabilities' }]),
  c('bat den cam', [light('on', 'orange')]),
  c('xin chao', [{ type: 'greet' }]),
  c('ke chuyen cuoi', [{ type: 'joke' }]),
  c('5 cong 3 bang may', [math([5, '+', 3], 8)]),
  c('quay trai', [turn('left')]),
  c('di sang phai', [walk('right')]),
  c('nhay ba lan roi vay tay', [j(3), wave()]),
  c('nhay hai muoi lan', [j(10)], { notes: ['capped'] }),
  c('hai muoi mot cong mot', [math([21, '+', 1], 22)]),
  c('nam nay la nam con gi', [lunar('year')]),
  c('nam xuong', [fall]),
  c('thoi tiet ha nam', [wx('HaNam')]),
  c('ngay mot co mua khong', [wx(null, 2, 'rain')]),
  c('an mot qua chuoi', [unsup('physical', EAT, ['chuối', 'a banana'])]),
  c('xoay trai 3 vong', [turn('spin', 3)]),
]

export const DIALECT: Case[] = [
  c('chừ mấy giờ rồi rứa', [time]),
  c('mi làm được chi', [{ type: 'capabilities' }]),
  c('lắc trốc đi', [shake()]),
  c('gật trốc ba cái', [nod(3)]),
  c('bữa ni thứ mấy rứa', [weekday(0)]),
  c('hôm ni thứ mấy', [weekday(0)]),
  c('thời tiết ngoài Huế răng rồi', [wx('ThuaThienHue')]),
  c('tắt cái quạt ni đi', [fan({ power: 'off' })], { ctx: { fanOn: true } }),
  c('nhảy cho tau coi cái', [j()]),
  c('răng mà mi dở rứa', [{ type: 'insult' }]),
  c('bổ xuống đi', [fall]),
  c('mần ơn bật đèn lên', [light('on')]),
  c('mở quạt giùm tui nghen', [fan({ power: 'on' })]),
  c('quẹo mặt', [turn('right')]),
  c('mấy giờ rồi dzậy', [time]),
  c('bữa nay thứ mấy vậy', [weekday(0)]),
  c('hổng biết mấy giờ rồi ta', [time]),
  c('chạy lẹ lên', [run()]),
  c('giỡn chút đi', [{ type: 'joke' }]),
  c('đèn đỏ lên coi', [light('on', 'red')]),
  c('hông cần bật quạt đâu', [not('fan')]),
  c('nóng quá trời, mở quạt đi', [fan({ power: 'on' })]),
  c('nhảy hoài', [j(10)], { notes: ['capped'] }),
  c('làm mặt quạu coi', [emote('angry')]),
  c('mô hình của bạn là gì', [intro('project')]),
  c('CHỪ MẤY GIỜ RỒI RỨA', [time]),
  c('đi nhởi', [walk()]),
  c('bựa ni trời có mưa không', [wx(null, 0, 'rain')]),
  c('bữa nay trời nóng hông', [wx(null, 0, 'temp')]),
  c('tui buồn quá', [small('user_sad')]),
  c('mở cái quạt lên giùm con', [fan({ power: 'on' })]),
  c('thời tiết TP. Ho Chi Minh', [wx('HoChiMinh')]),
]

export const TYPOS: Case[] = [
  c('nhẩy 2 lần', [j(2)]),
  c('vẩy tay', [wave()]),
  c('tắc đèn', [light('off')]),
  c('sin chào', [{ type: 'greet' }]),
  c('nahy', [j()]),
  c('quạc máy mở lên', [fan({ power: 'on' })]),
  c('dẫy tay', [wave()]),
  c('cám ơn', [{ type: 'thanks' }]),
]

export const CHAINS: Case[] = [
  c('nhảy rồi vẫy tay', [j(), wave()]),
  c('nhảy 2 lần rồi vẫy tay 3 lần', [j(2), wave(3)]),
  c('bật đèn, sau đó nhảy một bài', [light('on'), dance()]),
  c('ngồi xuống xong rồi đứng lên', [sit, stand]),
  c('quay trái rồi đi tới hai bước', [turn('left'), walk('forward', 2)]),
  c('nhảy ba lần vẫy tay hai lần', [j(3), wave(2)]),
  c('trước khi nhảy thì vẫy tay', [wave(), j()]),
  c('mấy giờ rồi, nhảy 2 cái đi', [time, j(2)]),
  c('quay trái rồi phải', [turn('left'), turn('right')]),
  c('Nhảy 3 lần. Sau đó vẫy tay!', [j(3), wave()]),
  c('không phải nhảy mà là vẫy tay', [wave()]),
]

export const REPEATS: Case[] = [
  c('lần nữa', [j(3)], { ctx: { last: [{ type: 'jump', count: 3 }] } }),
  c('làm lại 2 lần', [wave(2)], { ctx: { last: [{ type: 'wave', count: 1 }] } }),
  c('làm lại', [j(2), wave()], {
    ctx: {
      last: [
        { type: 'jump', count: 2 },
        { type: 'wave', count: 1 },
      ],
    },
  }),
  c('làm lại 3 lần', [j(), wave(), j(), wave(), j(), wave()], {
    ctx: {
      last: [
        { type: 'jump', count: 1 },
        { type: 'wave', count: 1 },
      ],
    },
  }),
  c('lần nữa', [], { notes: ['nothing_to_repeat'] }),
  c('nhảy lại', [j()]),
  c('nhảy 50 lần', [j(10)], { notes: ['capped'] }),
  c('quay 9 vòng', [turn('spin', 5)], { notes: ['capped'] }),
  c('đi tới 20 bước', [walk('forward', 10)], { notes: ['capped'] }),
]

export const NEGATION: Case[] = [
  c('đừng nhảy nữa', [stop], { ctx: { activity: 'dancing' } }),
  c('đừng nhảy', [not('jump')]),
  c('không cần bật đèn', [not('light')]),
  c('đừng tắt đèn', [not('light')], { ctx: { lightOn: true } }),
  c('thôi', [stop], { ctx: { activity: 'walking' } }),
  c('thôi nhảy đi', [j()]),
  c('thôi, nhảy đi', [stop, j()]),
]

export const UNSUPPORTED: Case[] = [
  c('ăn một quả chuối', [unsup('physical', EAT, ['chuối', 'a banana'])]),
  c('ăn phở', [unsup('physical', EAT, ['phở', 'phở'])]),
  c('ăn bánh mì đi', [unsup('physical', EAT, ['bánh mì', 'bread'])]),
  c('uống nước đi', [unsup('physical', DRINK, ['nước', 'water'])]),
  c('uống cà phê', [unsup('physical', DRINK, ['cà phê', 'coffee'])]),
  c('uống một ly trà', [unsup('physical', DRINK, ['trà', 'tea'])]),
  c('đọc một cuốn sách', [unsup('out_of_scope', ['đọc', 'read'], ['sách', 'a book'], { type: 'joke' })]),
  c('bay lên trời đi', [unsup('physical', ['bay', 'fly'], undefined, { type: 'jump', count: 1 })]),
  c('hát một bài', [unsup('out_of_scope', ['hát', 'sing'], undefined, { type: 'dance', seconds: 6 })]),
  c('gọi điện cho con trai tôi', [unsup('out_of_scope', ['gọi điện', 'make phone calls'])]),
  c('đi chợ mua rau', [unsup('physical', ['mua', 'buy'], ['rau', 'vegetables'])]),
  c('đánh răng', [unsup('physical', ['đánh răng', 'brush my teeth'])]),
  c('đấm tôi đi', [unsup('unsafe', ['đánh người', 'hit people'], undefined, { type: 'punch', count: 1 })]),
  c('nấu cơm giùm tui', [unsup('physical', ['nấu ăn', 'cook'])]),
  c('ăn chuối rồi nhảy', [unsup('physical', EAT, ['chuối', 'a banana']), j()]),
  // never echo arbitrary text: an unknown object is simply left out
  c('ăn con khủng long', [unsup('physical', EAT)]),
]

export const UNKNOWN: Case[] = [
  c('', [], { unknown: true }),
  c('   ', [], { unknown: true }),
  c('xyz abc', [], { unknown: true }),
  c('con mèo màu gì', [], { unknown: true }),
  c('chi phí bao nhiêu', [], { unknown: true }),
  c('bật lên', [], { unknown: true }),
  c('nhảy và xyz', [j()]),
  c('ok', [], { unknown: true }),
  c('ừ', [], { unknown: true }),
  c('trời ơi', [], { unknown: true }),
]

export const ALL_GROUPS: [string, Case[]][] = [
  ['BRIEF chips', CHIPS],
  ['motion', MOTION],
  ['information', INFO],
  ['math', MATH],
  ['conversation', CHAT],
  ['smart home', HOME],
  ['no diacritics', ASCII],
  ['dialect', DIALECT],
  ['typos', TYPOS],
  ['chains', CHAINS],
  ['repeats and caps', REPEATS],
  ['negation', NEGATION],
  ['unsupported', UNSUPPORTED],
  ['unknown', UNKNOWN],
]

/** Shorthands shared with regressions.test.ts. */
export const X = {
  c,
  j,
  dance,
  wave,
  nod,
  shake,
  thumbs,
  punch,
  walk,
  run,
  turn,
  sit,
  stand,
  sleep,
  wake,
  fall,
  stop,
  emote,
  time,
  date,
  weekday,
  lunar,
  timer,
  wx,
  math,
  light,
  fan,
  intro,
  small,
  not,
  unsup,
  EAT,
  DRINK,
}
